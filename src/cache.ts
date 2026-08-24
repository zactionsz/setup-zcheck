import { randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { extractBinary } from './archive'
import { archiveName, binaryName, type Target } from './contracts'
import { MAX_ARCHIVE_BYTES } from './download'
import { copyVerifiedFile, MAX_BINARY_BYTES, sha256File, verifyVersion } from './tool'

export interface CacheDependencies {
  copyVerifiedFile: typeof copyVerifiedFile
  extractBinary: typeof extractBinary
  sha256File: typeof sha256File
  verifyVersion: typeof verifyVersion
}

export async function validCache(
  installDir: string,
  activationDir: string,
  version: string,
  target: Target,
  archiveSha256: string,
  dependencies: CacheDependencies
): Promise<boolean> {
  const binaryPath = path.join(installDir, binaryName(target))
  const archivePath = path.join(installDir, archiveName(version, target))
  const validationRoot = `${activationDir}.validation`
  const privateArchive = path.join(validationRoot, archiveName(version, target))
  const extracted = path.join(validationRoot, 'extracted')
  const privateBinary = path.join(validationRoot, 'cached', binaryName(target))
  try {
    await mkdir(path.dirname(privateArchive), { recursive: true })
    if (
      !(await dependencies.copyVerifiedFile(
        archivePath,
        privateArchive,
        archiveSha256,
        MAX_ARCHIVE_BYTES
      ))
    ) return false

    const candidate = await dependencies.extractBinary(privateArchive, extracted, target)
    dependencies.verifyVersion(candidate, version)
    const candidateSha256 = await dependencies.sha256File(candidate)
    await mkdir(path.dirname(privateBinary), { recursive: true })
    if (
      !(await dependencies.copyVerifiedFile(
        binaryPath,
        privateBinary,
        candidateSha256,
        MAX_BINARY_BYTES
      ))
    ) return false
    if (!target.endsWith('-windows-msvc')) await chmod(privateBinary, 0o755)
    dependencies.verifyVersion(privateBinary, version)
    await mkdir(path.dirname(activationDir), { recursive: true })
    await rename(path.dirname(privateBinary), activationDir)
    return true
  } catch {
    await rm(activationDir, { force: true, recursive: true })
    return false
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
  binarySha256: string,
  dependencies: CacheDependencies
): Promise<void> {
  await mkdir(path.dirname(installDir), { recursive: true })
  const publishDir = `${installDir}.${randomUUID()}.tmp`
  const destination = path.join(publishDir, binaryName(target))
  const cachedArchive = path.join(publishDir, archiveName(version, target))
  try {
    await mkdir(publishDir)
    if (
      !(await dependencies.copyVerifiedFile(
        source,
        destination,
        binarySha256,
        MAX_BINARY_BYTES
      ))
    ) throw new Error('SHA-256 mismatch while staging the verified zcheck executable')
    if (
      !(await dependencies.copyVerifiedFile(
        archive,
        cachedArchive,
        archiveSha256,
        MAX_ARCHIVE_BYTES
      ))
    ) throw new Error('SHA-256 mismatch while staging the verified zcheck archive')
    if (!target.endsWith('-windows-msvc')) await chmod(destination, 0o755)
    dependencies.verifyVersion(destination, version)

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rename(publishDir, installDir)
        return
      } catch (error: unknown) {
        if (
          await cacheEntryMatches(
            installDir,
            publishDir,
            version,
            target,
            archiveSha256,
            binarySha256,
            dependencies
          )
        ) return
        if (!isDestinationConflict(error)) throw error
        await replaceInvalidEntry(installDir)
      }
    }
    throw new Error(`Unable to publish the verified zcheck cache entry at ${installDir}`)
  } finally {
    await rm(publishDir, { force: true, recursive: true })
  }
}

export async function activateVerified(
  source: string,
  activationDir: string,
  version: string,
  target: Target,
  binarySha256: string,
  dependencies: CacheDependencies
): Promise<void> {
  const destination = path.join(activationDir, binaryName(target))
  try {
    await mkdir(activationDir, { recursive: true })
    if (
      !(await dependencies.copyVerifiedFile(
        source,
        destination,
        binarySha256,
        MAX_BINARY_BYTES
      ))
    ) throw new Error('SHA-256 mismatch while activating the verified zcheck executable')
    if (!target.endsWith('-windows-msvc')) await chmod(destination, 0o755)
    dependencies.verifyVersion(destination, version)
  } catch (error: unknown) {
    await rm(activationDir, { force: true, recursive: true })
    throw error
  }
}

async function cacheEntryMatches(
  installDir: string,
  scratchRoot: string,
  version: string,
  target: Target,
  archiveSha256: string,
  binarySha256: string,
  dependencies: CacheDependencies
): Promise<boolean> {
  const verificationRoot = path.join(scratchRoot, `winner-${randomUUID()}`)
  const archiveCopy = path.join(verificationRoot, archiveName(version, target))
  const binaryCopy = path.join(verificationRoot, binaryName(target))
  try {
    await mkdir(verificationRoot, { recursive: true })
    const archiveMatches = await dependencies.copyVerifiedFile(
      path.join(installDir, archiveName(version, target)),
      archiveCopy,
      archiveSha256,
      MAX_ARCHIVE_BYTES
    )
    const binaryMatches = await dependencies.copyVerifiedFile(
      path.join(installDir, binaryName(target)),
      binaryCopy,
      binarySha256,
      MAX_BINARY_BYTES
    )
    if (!archiveMatches || !binaryMatches) return false
    if (!target.endsWith('-windows-msvc')) await chmod(binaryCopy, 0o755)
    dependencies.verifyVersion(binaryCopy, version)
    return true
  } catch {
    return false
  } finally {
    await rm(verificationRoot, { force: true, recursive: true })
  }
}

async function replaceInvalidEntry(installDir: string): Promise<void> {
  const invalidDir = `${installDir}.${randomUUID()}.invalid`
  try {
    await rename(installDir, invalidDir)
    await rm(invalidDir, { force: true, recursive: true })
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
  }
}

function isDestinationConflict(error: unknown): boolean {
  return (
    isErrnoException(error) &&
    (error.code === 'EEXIST' || error.code === 'ENOTEMPTY' || error.code === 'EPERM')
  )
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
