import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export interface RunResult {
  output: string
}

export type RunCommand = (command: string, args: string[]) => RunResult

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

export function verifyVersion(
  binaryPath: string,
  version: string,
  runCommand: RunCommand = run
): void {
  const result = runCommand(binaryPath, ['--version'])
  const actual = result.output.trim()
  const expected = `zcheck ${version}`
  if (actual !== expected) {
    throw new Error(`zcheck reported ${JSON.stringify(actual)} instead of ${expected}`)
  }
}

export function run(command: string, args: string[]): RunResult {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  })
  if (result.error) {
    throw new Error(`Unable to run ${command}: ${result.error.message}`)
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}: ${output.trim()}`)
  }
  return { output }
}
