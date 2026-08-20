import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
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

test('ships built files without an install-time build script', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.scripts.prepare, undefined)
  assert.equal(manifest.scripts.prepack, 'npm run build')
  assert.equal(typeof manifest.exports['./browser-peer'].default, 'string')
  assert.equal(manifest.exports['./host/connection'].default, './lib/host/connection.js')
  assert.equal(manifest.exports['./host/gateway'].default, './lib/host/gateway.js')
})
