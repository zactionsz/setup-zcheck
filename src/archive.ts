import { chmod, lstat, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { binaryName, type Target } from './contracts'
import { run, type RunCommand } from './tool'

export async function extractBinary(
  archivePath: string,
  destination: string,
  target: Target,
  runCommand: RunCommand = run
): Promise<string> {
  const binary = binaryName(target)
  const compressed = archivePath.endsWith('.tar.gz')
  const listing = runCommand('tar', [compressed ? '-tzf' : '-tf', archivePath]).output
  validateEntries(listing.split(/\r?\n/u).filter(Boolean), binary)

  await mkdir(destination, { recursive: true })
  runCommand('tar', [compressed ? '-xzf' : '-xf', archivePath, '-C', destination, binary])

  const binaryPath = path.join(destination, binary)
  const metadata = await lstat(binaryPath)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Archive member ${binary} is not a regular file`)
  }
  if (!target.endsWith('-windows-msvc')) await chmod(binaryPath, 0o755)
  return binaryPath
}

export function validateEntries(entries: readonly string[], binary: string): void {
  const names = new Set<string>()
  const caseInsensitiveNames = new Set<string>()

  for (const entry of entries) {
    if (
      entry.includes('\\') ||
      entry.includes('\0') ||
      path.posix.isAbsolute(entry) ||
      entry.split('/').includes('..')
    ) {
      throw new Error(`Unsafe archive entry ${JSON.stringify(entry)}`)
    }
    if (names.has(entry) || caseInsensitiveNames.has(entry.toLowerCase())) {
      throw new Error(`Duplicate archive entry ${JSON.stringify(entry)}`)
    }
    names.add(entry)
    caseInsensitiveNames.add(entry.toLowerCase())
  }

  if (!names.has(binary)) {
    throw new Error(`Archive does not contain ${binary}`)
  }
}
