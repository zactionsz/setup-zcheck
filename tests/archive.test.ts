import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { extractBinary, validateEntries } from '../src/archive'

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
  const calls: Array<[string, string[]]> = []

  const binary = await extractBinary(
    archive,
    destination,
    'x86_64-unknown-linux-gnu',
    (command, args) => {
      calls.push([command, args])
      if (args[0] === '-tzf') return { output: 'zcheck\nLICENSE\nREADME.md\n' }
      writeFileSync(path.join(destination, 'zcheck'), 'binary')
      return { output: '' }
    }
  )

  assert.equal(await readFile(binary, 'utf8'), 'binary')
  assert.deepEqual(calls[0], ['tar', ['-tzf', archive]])
  assert.deepEqual(calls[1], ['tar', ['-xzf', archive, '-C', destination, 'zcheck']])
})
