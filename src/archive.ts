import { chmod, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { binaryName, type Target } from './contracts'
import {
  MAX_BINARY_BYTES,
  run,
  runBytes,
  type RunBinaryCommand,
  type RunCommand
} from './tool'

export async function extractBinary(
  archivePath: string,
  destination: string,
  target: Target,
  runCommand: RunCommand = run,
  runBinaryCommand: RunBinaryCommand = runBytes,
  maxBinaryBytes: number = MAX_BINARY_BYTES
): Promise<string> {
  const binary = binaryName(target)
  const compressed = archivePath.endsWith('.tar.gz')
  const listing = runCommand('tar', [compressed ? '-tzf' : '-tf', archivePath]).output
  validateEntries(listing.split(/\r?\n/u).filter(Boolean), binary)

  await mkdir(destination, { recursive: true })
  const binaryPath = path.join(destination, binary)
  const contents = runBinaryCommand(
    'tar',
    [compressed ? '-xOzf' : '-xOf', archivePath, binary],
    maxBinaryBytes
  )
  if (contents.length > maxBinaryBytes) {
    throw new Error(`Archive member ${binary} exceeds the ${maxBinaryBytes}-byte safety limit`)
  }
  await writeFile(binaryPath, contents, { flag: 'wx', mode: 0o600 })
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
