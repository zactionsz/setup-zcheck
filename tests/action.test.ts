import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { runAction } from '../src/action'
import { installDirectory } from '../src/contracts'
import { verifyVersion } from '../src/tool'

const VERSION = '0.0.2'
const TARGET = 'x86_64-unknown-linux-gnu' as const

interface Fixture {
  environment: NodeJS.ProcessEnv
  outputFile: string
  pathFile: string
  sha256: string
  toolCache: string
}

test('installs a verified binary and only probes its version', async (context) => {
  const fixture = await createFixture(context, 'archive bytes')
  const versionProbes: Array<{ binary: string; version: string }> = []

  const result = await runAction(fixture.environment, {
    download: async (_url, archive) => {
      await mkdir(path.dirname(archive), { recursive: true })
      await writeFile(archive, 'archive bytes')
    },
    extractBinary: async (_archive, destination) => {
      await mkdir(destination, { recursive: true })
      const binary = path.join(destination, 'zcheck')
      await writeFile(binary, 'zcheck binary')
      return binary
    },
    resolveTarget: () => TARGET,
    verifyVersion: (binary, version) => versionProbes.push({ binary, version })
  })

  assert.equal(result.version, VERSION)
  assert.equal(result.target, TARGET)
  assert.equal(result.cacheHit, false)
  assert.equal(await readFile(result.binaryPath, 'utf8'), 'zcheck binary')
  assert.equal(versionProbes.length, 2)
  assert.deepEqual(
    versionProbes.map(({ version }) => version),
    [VERSION, VERSION]
  )
  assert.match(await readFile(fixture.pathFile, 'utf8'), new RegExp(`${fixture.sha256}\\r?\\n$`, 'u'))
  assert.match(await readFile(fixture.outputFile, 'utf8'), /cache-hit=false/u)
})

test('reuses a verified cache entry without downloading', async (context) => {
  const fixture = await createFixture(context, 'archive bytes')
  const installDir = installDirectory(fixture.toolCache, VERSION, TARGET, fixture.sha256)
  const binary = path.join(installDir, 'zcheck')
  await mkdir(installDir, { recursive: true })
  await writeFile(binary, 'cached binary')
  await writeFile(path.join(installDir, `zcheck-${VERSION}-${TARGET}.tar.gz`), 'archive bytes')

  const result = await runAction(fixture.environment, {
    download: async () => assert.fail('download should not run'),
    extractBinary: async (_archive, destination) => {
      await mkdir(destination, { recursive: true })
      const candidate = path.join(destination, 'zcheck')
      await writeFile(candidate, 'cached binary')
      return candidate
    },
    resolveTarget: () => TARGET,
    verifyVersion: () => undefined
  })

  assert.equal(result.cacheHit, true)
  assert.equal(result.binaryPath, binary)
  assert.match(await readFile(fixture.outputFile, 'utf8'), /cache-hit=true/u)
})

test('replaces a cache entry whose executable does not match the pinned archive', async (context) => {
  const fixture = await createFixture(context, 'archive bytes')
  const installDir = installDirectory(fixture.toolCache, VERSION, TARGET, fixture.sha256)
  await mkdir(installDir, { recursive: true })
  await writeFile(path.join(installDir, 'zcheck'), 'tampered binary')
  await writeFile(path.join(installDir, `zcheck-${VERSION}-${TARGET}.tar.gz`), 'archive bytes')
  let downloadCount = 0

  const result = await runAction(fixture.environment, {
    download: async (_url, archive) => {
      downloadCount += 1
      await mkdir(path.dirname(archive), { recursive: true })
      await writeFile(archive, 'archive bytes')
    },
    extractBinary: async (_archive, destination) => {
      await mkdir(destination, { recursive: true })
      const candidate = path.join(destination, 'zcheck')
      await writeFile(candidate, 'verified binary')
      return candidate
    },
    resolveTarget: () => TARGET,
    verifyVersion: () => undefined
  })

  assert.equal(downloadCount, 1)
  assert.equal(result.cacheHit, false)
  assert.equal(await readFile(result.binaryPath, 'utf8'), 'verified binary')
})

test('does not extract, cache, or export a download with the wrong digest', async (context) => {
  const fixture = await createFixture(context, 'expected archive')

  await assert.rejects(
    runAction(fixture.environment, {
      download: async (_url, archive) => {
        await mkdir(path.dirname(archive), { recursive: true })
        await writeFile(archive, 'wrong archive')
      },
      extractBinary: async () => assert.fail('extraction should not run'),
      resolveTarget: () => TARGET,
      verifyVersion: () => assert.fail('version probe should not run')
    }),
    /SHA-256 mismatch/u
  )

  assert.equal(await readFile(fixture.outputFile, 'utf8'), '')
  assert.equal(await readFile(fixture.pathFile, 'utf8'), '')
})

test('the binary identity probe invokes only --version', () => {
  let invocation: { args: string[]; command: string } | undefined
  verifyVersion('/cache/zcheck', VERSION, (command, args) => {
    invocation = { args, command }
    return { output: `zcheck ${VERSION}\n` }
  })
  assert.deepEqual(invocation, { args: ['--version'], command: '/cache/zcheck' })
})

async function createFixture(context: TestContext, archiveContents: string): Promise<Fixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-action-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const outputFile = path.join(root, 'output')
  const pathFile = path.join(root, 'path')
  const sha256 = createHash('sha256').update(archiveContents).digest('hex')
  const toolCache = path.join(root, 'cache')
  await Promise.all([writeFile(outputFile, ''), writeFile(pathFile, '')])

  return {
    environment: {
      GITHUB_OUTPUT: outputFile,
      GITHUB_PATH: pathFile,
      INPUT_SHA256: sha256,
      INPUT_VERSION: VERSION,
      RUNNER_TEMP: path.join(root, 'temp'),
      RUNNER_TOOL_CACHE: toolCache
    },
    outputFile,
    pathFile,
    sha256,
    toolCache
  }
}
