import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { extractBinary, validateEntries } from '../src/archive'
import { runBytes } from '../src/tool'

test('accepts the release layout and rejects unsafe entries', () => {
  assert.doesNotThrow(() => validateEntries(['zcheck', 'LICENSE', 'README.md'], 'zcheck'))
  assert.throws(() => validateEntries(['../zcheck'], 'zcheck'), /Unsafe/u)
  assert.throws(() => validateEntries(['/zcheck'], 'zcheck'), /Unsafe/u)
  assert.throws(() => validateEntries(['dir\\zcheck'], 'zcheck'), /Unsafe/u)
  assert.throws(() => validateEntries(['zcheck', 'ZCHECK'], 'zcheck'), /Duplicate/u)
  assert.throws(() => validateEntries(['README.md'], 'zcheck'), /does not contain/u)
})

test('lists the archive and extracts only the expected binary', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-archive-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const archive = path.join(root, 'release.tar.gz')
  const destination = path.join(root, 'out')
  const calls: Array<[string, string[], number?]> = []

  const binary = await extractBinary(
    archive,
    destination,
    'x86_64-unknown-linux-gnu',
    (command, args) => {
      calls.push([command, args])
      return { output: 'zcheck\nLICENSE\nREADME.md\n' }
    },
    (command, args, maxBytes) => {
      calls.push([command, args, maxBytes])
      return Buffer.from('binary')
    }
  )

  assert.equal(await readFile(binary, 'utf8'), 'binary')
  assert.deepEqual(calls[0], ['tar', ['-tzf', archive]])
  assert.deepEqual(calls[1]?.slice(0, 2), ['tar', ['-xOzf', archive, 'zcheck']])
})

test('rejects archive members and command output above the expanded-size limit', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-archive-limit-'))
  context.after(() => rm(root, { force: true, recursive: true }))

  await assert.rejects(
    extractBinary(
      path.join(root, 'release.tar.gz'),
      path.join(root, 'out'),
      'x86_64-unknown-linux-gnu',
      () => ({ output: 'zcheck\n' }),
      () => Buffer.from('12345'),
      4
    ),
    /4-byte safety limit/u
  )
  assert.throws(
    () => runBytes(process.execPath, ['-e', 'process.stdout.write("12345")'], 4),
    /4-byte safety limit/u
  )
})
