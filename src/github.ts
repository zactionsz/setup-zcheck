import { appendFileSync } from 'node:fs'
import { EOL } from 'node:os'

export function input(name: string, environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment[`INPUT_${name.replaceAll('-', '_').toUpperCase()}`]
  if (!value?.trim()) throw new Error(`Input ${name} is required`)
  return value
}

export function setOutput(
  name: string,
  value: string,
  environment: NodeJS.ProcessEnv = process.env
): void {
  appendKeyValue(environment.GITHUB_OUTPUT, name, value, 'GITHUB_OUTPUT')
}

export function addPath(value: string, environment: NodeJS.ProcessEnv = process.env): void {
  appendLine(environment.GITHUB_PATH, value, 'GITHUB_PATH')
}

function appendKeyValue(
  file: string | undefined,
  name: string,
  value: string,
  variable: string
): void {
  if (/\r|\n/u.test(name) || /\r|\n/u.test(value)) {
    throw new Error(`Cannot write multiline values to ${variable}`)
  }
  appendLine(file, `${name}=${value}`, variable)
}

function appendLine(file: string | undefined, value: string, variable: string): void {
  if (!file) throw new Error(`${variable} is not set`)
  if (/\r|\n/u.test(value)) {
    throw new Error(`Cannot write multiline values to ${variable}`)
  }
  appendFileSync(file, `${value}${EOL}`, { encoding: 'utf8' })
}

export function info(message: string): void {
  process.stdout.write(`${message}${EOL}`)
}

export function setFailed(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`::error::${escapeWorkflowCommand(message)}${EOL}`)
  process.exitCode = 1
}

function escapeWorkflowCommand(message: string): string {
  return message
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
}
