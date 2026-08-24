import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, rename, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { extractBinary } from './archive'
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
import { sha256File, verifyVersion } from './tool'

interface ActionDependencies {
  download: typeof download
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
  const installedBinary = path.join(installDir, binaryName(target))
  let cacheHit = await validCache(
    installDir,
    runnerTemp,
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
      await publishVerified(
        candidate,
        archive,
        installDir,
        version,
        target,
        expectedSha256,
        dependencies
      )
    } finally {
      await rm(stagingRoot, { force: true, recursive: true })
    }
    cacheHit = false
  }

  github.addPath(installDir, environment)
  github.setOutput('version', version, environment)
  github.setOutput('target', target, environment)
  github.setOutput('sha256', expectedSha256, environment)
  github.setOutput('path', installedBinary, environment)
  github.setOutput('cache-hit', String(cacheHit), environment)
  github.info(`Installed and verified zcheck ${version} for ${target}`)

  return { binaryPath: installedBinary, cacheHit, sha256: expectedSha256, target, version }
}

export async function validCache(
  installDir: string,
  runnerTemp: string,
  version: string,
  target: Target,
  archiveSha256: string,
  dependencies: ActionDependencies
): Promise<boolean> {
  const binaryPath = path.join(installDir, binaryName(target))
  const archivePath = path.join(installDir, archiveName(version, target))
  const validationRoot = path.resolve(
    runnerTemp,
    'setup-zcheck-cache-validation',
    `${version}-${target}-${randomUUID()}`
  )
  try {
    const [binaryMetadata, archiveMetadata] = await Promise.all([
      lstat(binaryPath),
      lstat(archivePath)
    ])
    if (
      !binaryMetadata.isFile() ||
      binaryMetadata.isSymbolicLink() ||
      !archiveMetadata.isFile() ||
      archiveMetadata.isSymbolicLink() ||
      (await dependencies.sha256File(archivePath)) !== archiveSha256
    ) {
      return false
    }

    const candidate = await dependencies.extractBinary(archivePath, validationRoot, target)
    dependencies.verifyVersion(candidate, version)
    const [candidateSha256, binarySha256] = await Promise.all([
      dependencies.sha256File(candidate),
      dependencies.sha256File(binaryPath)
    ])
    if (candidateSha256 !== binarySha256) return false
    dependencies.verifyVersion(binaryPath, version)
    return true
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') return false
    throw error
  } finally {
    await rm(validationRoot, { force: true, recursive: true })
  }
}

export async function publishVerified(
  source: string,
  archive: string,
  installDir: string,
  version: string,
  target: Target,
  archiveSha256: string,
  dependencies: ActionDependencies
): Promise<void> {
  await mkdir(path.dirname(installDir), { recursive: true })
  const publishDir = `${installDir}.${randomUUID()}.tmp`
  const destination = path.join(publishDir, binaryName(target))
  const cachedArchive = path.join(publishDir, archiveName(version, target))
  try {
    await mkdir(publishDir)
    await copyFile(source, destination, constants.COPYFILE_EXCL)
    await copyFile(archive, cachedArchive, constants.COPYFILE_EXCL)
    if (!target.endsWith('-windows-msvc')) await chmod(destination, 0o755)
    const [sourceSha256, destinationSha256, cachedArchiveSha256] = await Promise.all([
      dependencies.sha256File(source),
      dependencies.sha256File(destination),
      dependencies.sha256File(cachedArchive)
    ])
    if (sourceSha256 !== destinationSha256) {
      throw new Error('SHA-256 mismatch while staging the verified zcheck executable')
    }
    if (cachedArchiveSha256 !== archiveSha256) {
      throw new Error('SHA-256 mismatch while staging the verified zcheck archive')
    }
    dependencies.verifyVersion(destination, version)

    await rm(installDir, { force: true, recursive: true })
    await rename(publishDir, installDir)
  } finally {
    await rm(publishDir, { force: true, recursive: true })
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
