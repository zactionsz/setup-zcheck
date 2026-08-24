import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { download, MAX_ARCHIVE_BYTES } from '../src/download'

test('downloads release bytes atomically', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-download-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const destination = path.join(root, 'nested', 'zcheck.tar.gz')

  await download(
    'https://example.invalid/zcheck.tar.gz',
    destination,
    async () => new Response('verified bytes', { status: 200 })
  )

  assert.equal(await readFile(destination, 'utf8'), 'verified bytes')
})

test('rejects failed and oversized downloads without a partial archive', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-download-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const destination = path.join(root, 'zcheck.tar.gz')

  await assert.rejects(
    download(
      'https://example.invalid/zcheck.tar.gz',
      destination,
      async () => new Response('missing', { status: 404 })
    ),
    /HTTP 404/u
  )
  await assert.rejects(readFile(destination), /ENOENT/u)

  await assert.rejects(
    download(
      'https://example.invalid/zcheck.tar.gz',
      destination,
      async () =>
        new Response('small', {
          headers: { 'content-length': String(MAX_ARCHIVE_BYTES + 1) },
          status: 200
        })
    ),
    /safety limit/u
  )
  await assert.rejects(readFile(destination), /ENOENT/u)
})
