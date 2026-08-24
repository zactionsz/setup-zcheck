import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractBinary } from './archive'
import { activateVerified, publishVerified, validCache } from './cache'
import {
  archiveName,
  binaryName,
  installDirectory,
  releaseUrl,
  requireSha256,
  requireVersion,
  resolveTarget,
  type Target
} from './contracts'
import { download } from './download'
import * as github from './github'
import { copyVerifiedFile, sha256File, verifyVersion } from './tool'

interface ActionDependencies {
  download: typeof download
  copyVerifiedFile: typeof copyVerifiedFile
  extractBinary: typeof extractBinary
  resolveTarget: typeof resolveTarget
  sha256File: typeof sha256File
  verifyVersion: typeof verifyVersion
}

export interface ActionResult {
  binaryPath: string
  cacheHit: boolean
  sha256: string
  target: Target
  version: string
}

export async function runAction(
  environment: NodeJS.ProcessEnv = process.env,
  overrides: Partial<ActionDependencies> = {}
): Promise<ActionResult> {
  const dependencies: ActionDependencies = {
    copyVerifiedFile,
    download,
    extractBinary,
    resolveTarget,
    sha256File,
    verifyVersion,
    ...overrides
  }
  const version = requireVersion(github.input('version', environment))
  const expectedSha256 = requireSha256(github.input('sha256', environment))
  const target = dependencies.resolveTarget()
  const toolCache = environment.RUNNER_TOOL_CACHE ?? environment.RUNNER_TEMP ?? os.tmpdir()
  const runnerTemp = environment.RUNNER_TEMP ?? os.tmpdir()
  const installDir = installDirectory(toolCache, version, target, expectedSha256)
  const activationDir = path.resolve(
    runnerTemp,
    'setup-zcheck-active',
    `${version}-${target}-${expectedSha256}-${randomUUID()}`
  )
  const installedBinary = path.join(activationDir, binaryName(target))
  let cacheHit = await validCache(
    installDir,
    activationDir,
    version,
    target,
    expectedSha256,
    dependencies
  )

  if (cacheHit) {
    github.info(`Using verified cached zcheck ${version} for ${target}`)
  } else {
    const stagingRoot = path.resolve(
      runnerTemp,
      'setup-zcheck-staging',
      `${version}-${target}-${randomUUID()}`
    )
    const archive = path.join(stagingRoot, archiveName(version, target))
    const extracted = path.join(stagingRoot, 'extracted')

    try {
      const url = releaseUrl(version, target)
      github.info(`Downloading zcheck ${version} for ${target}`)
      await dependencies.download(url, archive)
      const actualSha256 = await dependencies.sha256File(archive)
      if (actualSha256 !== expectedSha256) {
        throw new Error(
          `SHA-256 mismatch for ${path.basename(archive)}: expected ` +
            `${expectedSha256}, received ${actualSha256}`
        )
      }

      const candidate = await dependencies.extractBinary(archive, extracted, target)
      dependencies.verifyVersion(candidate, version)
      const candidateSha256 = await dependencies.sha256File(candidate)
      await publishVerified(
        candidate,
        archive,
        installDir,
        version,
        target,
        expectedSha256,
        candidateSha256,
        dependencies
      )
      await activateVerified(
        candidate,
        activationDir,
        version,
        target,
        candidateSha256,
        dependencies
      )
    } finally {
      await rm(stagingRoot, { force: true, recursive: true })
    }
    cacheHit = false
  }

  github.addPath(activationDir, environment)
  github.setOutput('version', version, environment)
  github.setOutput('target', target, environment)
  github.setOutput('sha256', expectedSha256, environment)
  github.setOutput('path', installedBinary, environment)
  github.setOutput('cache-hit', String(cacheHit), environment)
  github.info(`Installed and verified zcheck ${version} for ${target}`)

  return { binaryPath: installedBinary, cacheHit, sha256: expectedSha256, target, version }
}
