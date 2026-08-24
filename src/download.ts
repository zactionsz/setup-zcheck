import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024

type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>

export async function download(
  url: string,
  destination: string,
  fetchImpl: FetchFunction = fetch
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${randomUUID()}.tmp`

  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'zactionsz/setup-zcheck' },
      redirect: 'follow'
    })
    if (!response.ok) {
      throw new Error(`Download failed with HTTP ${response.status} for ${url}`)
    }
    if (!response.body) {
      throw new Error(`Download returned an empty response body for ${url}`)
    }

    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ARCHIVE_BYTES) {
      throw new Error(`Download exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`)
    }

    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
        received += chunk.length
        if (received > MAX_ARCHIVE_BYTES) {
          callback(new Error(`Download exceeds the ${MAX_ARCHIVE_BYTES}-byte safety limit`))
          return
        }
        callback(null, chunk)
      }
    })

    await pipeline(
      Readable.fromWeb(response.body as unknown as NodeReadableStream),
      limit,
      createWriteStream(temporary, { flags: 'wx' })
    )
    await rename(temporary, destination)
  } catch (error: unknown) {
    await rm(temporary, { force: true })
    throw error
  }
}
