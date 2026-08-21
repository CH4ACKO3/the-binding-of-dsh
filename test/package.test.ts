import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  GatewayDispatchError,
  HostRemoteService,
  NodePeerClient,
  apply,
  createGatewayDispatcher,
  inject,
  installClientGateway,
  name,
} from '../lib/index.js'

test('exports the Host plugin entrypoint', () => {
  assert.equal(name, 'the-binding-of-dsh')
  assert.deepEqual(inject, ['harmony'])
  assert.equal(typeof apply, 'function')
  assert.equal(typeof createGatewayDispatcher, 'function')
  assert.equal(typeof installClientGateway, 'function')
  assert.equal(typeof HostRemoteService, 'function')
  assert.equal(typeof NodePeerClient, 'function')
  assert.equal(typeof GatewayDispatchError, 'function')
})

test('builds a DSH browser module', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(/)
  assert.match(source, /id: "the-binding-of-dsh"/)
})

test('browser module exposes the Connection binding used by its Harmony patch', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let definition
  runInNewContext(source, {
    AbortController,
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value
        },
      },
    },
  })
  assert.equal(definition.id, 'the-binding-of-dsh')
  const exports = definition.factory(() => assert.fail('browser module has no external dependency'))
  assert.equal(typeof exports.createClientConnectionBinding, 'function')
})

test('ships built files without an install-time build script', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.scripts.prepare, undefined)
  assert.equal(manifest.scripts.prepack, 'npm run build')
  assert.equal(typeof manifest.exports['./browser-peer'].default, 'string')
  assert.equal(manifest.exports['./host/connection'].default, './lib/host/connection.js')
  assert.equal(manifest.exports['./host/gateway'].default, './lib/host/gateway.js')
})

test('ships CommonJS patches loadable from node_modules', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'the-binding-of-dsh-package-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const packageDir = join(root, 'node_modules', 'the-binding-of-dsh')
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

  for (const patch of manifest.dsh.harmony.patches) {
    assert.match(patch, /\.cjs$/)
    const destination = join(packageDir, patch)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(new URL(`..${patch.slice(1)}`, import.meta.url), destination)
    assert.ok(createRequire(join(root, 'consumer.cjs'))(destination))
  }
})
