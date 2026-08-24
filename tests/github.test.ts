import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { addPath, input, setOutput } from '../src/github'

test('reads inputs and writes explicit workflow command files', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'setup-zcheck-github-'))
  context.after(() => rm(root, { force: true, recursive: true }))
  const output = path.join(root, 'output')
  const pathFile = path.join(root, 'path')
  await Promise.all([writeFile(output, ''), writeFile(pathFile, '')])
  const environment = {
    GITHUB_OUTPUT: output,
    GITHUB_PATH: pathFile,
    INPUT_VERSION: '0.0.2'
  }

  assert.equal(input('version', environment), '0.0.2')
  setOutput('target', 'x86_64-unknown-linux-gnu', environment)
  addPath('/tool cache/zcheck', environment)

  assert.match(await readFile(output, 'utf8'), /^target=x86_64-unknown-linux-gnu\r?\n$/u)
  assert.match(await readFile(pathFile, 'utf8'), /^\/tool cache\/zcheck\r?\n$/u)
})

test('rejects multiline workflow command values', () => {
  assert.throws(() => addPath('/safe\nunsafe', { GITHUB_PATH: '/tmp/unused' }), /multiline/u)
})
