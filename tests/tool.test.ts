import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { copyVerifiedFile, sha256File } from '../src/tool'

test('copies regular files only when the same opened bytes match the digest', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-copy-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const source = path.join(root, 'source')
  const destination = path.join(root, 'destination')
  const contents = 'verified bytes'
  const digest = createHash('sha256').update(contents).digest('hex')
  await writeFile(source, contents)

  assert.equal(await copyVerifiedFile(source, destination, digest, 1024), true)
  assert.equal(await readFile(destination, 'utf8'), contents)
  assert.equal(await sha256File(destination), digest)
})

test('rejects mismatches, oversized files, and symbolic-link sources', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-copy-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const source = path.join(root, 'source')
  const link = path.join(root, 'link')
  await writeFile(source, 'verified bytes')
  await symlink(source, link)

  assert.equal(
    await copyVerifiedFile(source, path.join(root, 'mismatch'), '0'.repeat(64), 1024),
    false
  )
  await assert.rejects(readFile(path.join(root, 'mismatch')), /ENOENT/u)
  await assert.rejects(
    copyVerifiedFile(source, path.join(root, 'oversized'), '0'.repeat(64), 4),
    /4-byte safety limit/u
  )
  await assert.rejects(
    copyVerifiedFile(link, path.join(root, 'linked'), '0'.repeat(64), 1024),
    /not a regular file|ELOOP/u
  )
})
