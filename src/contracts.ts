import path from 'node:path'

const RELEASE_BASE_URL = 'https://github.com/zsumz/zcheck/releases/download'
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u
const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/u

export type Target =
  | 'aarch64-apple-darwin'
  | 'aarch64-unknown-linux-gnu'
  | 'aarch64-unknown-linux-musl'
  | 'x86_64-apple-darwin'
  | 'x86_64-pc-windows-msvc'
  | 'x86_64-unknown-linux-gnu'
  | 'x86_64-unknown-linux-musl'

interface RuntimeReport {
  getReport(): { header?: { glibcVersionRuntime?: string } }
}

export function requireVersion(value: string): string {
  const version = value.trim()
  if (!VERSION_PATTERN.test(version)) {
    throw new Error('Invalid version; expected an exact stable version such as 0.0.2')
  }
  return version
}

export function requireSha256(value: string): string {
  const sha256 = value.trim()
  if (!SHA256_PATTERN.test(sha256)) {
    throw new Error('Invalid sha256; expected exactly 64 hexadecimal characters')
  }
  return sha256.toLowerCase()
}

export function resolveTarget(
  platform: string = process.platform,
  architecture: string = process.arch,
  report: RuntimeReport = process.report as RuntimeReport
): Target {
  if (platform === 'darwin') {
    if (architecture === 'x64') return 'x86_64-apple-darwin'
    if (architecture === 'arm64') return 'aarch64-apple-darwin'
  }

  if (platform === 'win32' && architecture === 'x64') {
    return 'x86_64-pc-windows-msvc'
  }

  if (platform === 'linux' && (architecture === 'x64' || architecture === 'arm64')) {
    const machine = architecture === 'x64' ? 'x86_64' : 'aarch64'
    return `${machine}-unknown-linux-${linuxLibc(report)}`
  }

  throw new Error(`Unsupported zcheck runner ${platform}/${architecture}`)
}

function linuxLibc(report: RuntimeReport): 'gnu' | 'musl' {
  try {
    const runtime = report.getReport().header?.glibcVersionRuntime
    return runtime ? 'gnu' : 'musl'
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Unable to detect the Linux C library: ${message}`)
  }
}

export function archiveName(version: string, target: Target): string {
  const extension = target.endsWith('-windows-msvc') ? 'zip' : 'tar.gz'
  return `zcheck-${version}-${target}.${extension}`
}

export function releaseUrl(version: string, target: Target): string {
  return `${RELEASE_BASE_URL}/v${version}/${archiveName(version, target)}`
}

export function installDirectory(
  toolCache: string,
  version: string,
  target: Target,
  sha256: string
): string {
  return path.resolve(toolCache, 'zcheck', version, target, sha256)
}

export function binaryName(target: Target): 'zcheck.exe' | 'zcheck' {
  return target.endsWith('-windows-msvc') ? 'zcheck.exe' : 'zcheck'
}
