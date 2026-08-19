import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { apply, inject, name } from '../lib/index.js'

test('exports the Host plugin entrypoint', () => {
  assert.equal(name, 'the-binding-of-dsh')
  assert.deepEqual(inject, ['harmony'])
  assert.equal(typeof apply, 'function')
})

test('builds a DSH browser module', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, /id: "the-binding-of-dsh"/)
})
