import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { tsquery } from '@phenomnomnominal/tsquery'
import MagicString from 'magic-string'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const declaration = require('../patches/connection.patch.cjs')
const gatewayDeclaration = require('../patches/gateway.patch.cjs')

function targetPath(member) {
  const packagePath = require.resolve(`${member.target.package}/package.json`)
  return new URL(member.target.files[0], `file://${packagePath}`).pathname
}

async function applyPatch(declaration) {
  const sources = new Map()
  for (const member of declaration.patches) {
    const path = targetPath(member)
    const source = sources.get(path) ?? await readFile(path, 'utf8')
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const matches = tsquery(sourceFile, member.select)
    assert.equal(matches.length, member.expect, `${member.id} selector count`)
    const edit = new MagicString(source)
    for (const node of matches) member.apply({ node, source, sourceFile, edit, ts })
    sources.set(path, edit.toString())
  }
  return sources
}

test('Connection Harmony patch binds and produces parseable rc.8 sources', async () => {
  const sources = await applyPatch(declaration)
  assert.equal(sources.size, 2)
  for (const [path, source] of sources) {
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    assert.deepEqual(parsed.parseDiagnostics, [], `${path} has parse diagnostics`)
  }

  const hostPath = require.resolve('@deepseek-ai/dsh-client-connection')
  const host = sources.get(hostPath)
  assert.match(host, /new HostConnectionBinding\(\)/)
  assert.ok(host.indexOf('super(ctx, "connection")') < host.indexOf('new HostConnectionBinding()'))
  assert.match(host, /this\.bidirectional\.attach\(kind, req, websocket\)/)
  assert.match(host, /new WebSocketDownlinks\(apiCtx\.apiProxy, connection\.bidirectional\)/)

  const clientPath = require.resolve('@deepseek-ai/dsh-client-connection/client')
  const client = sources.get(clientPath)
  assert.match(client, /await this\.bidirectional\?\.open\(signal\)/)
  assert.match(client, /new WebSocket\(url, generation\.id\)/)
  assert.match(client, /this\.bidirectional\?\.handle\(full, generation\)/)
  assert.match(client, /require\("the-binding-of-dsh"\)\.createClientConnectionBinding\(\)/)
})

test('Gateway Harmony patch binds and produces parseable rc.8 sources', async () => {
  const sources = await applyPatch(gatewayDeclaration)
  assert.equal(sources.size, 2)
  for (const [path, source] of sources) {
    const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    assert.deepEqual(parsed.parseDiagnostics, [], `${path} has parse diagnostics`)
  }

  const hostPath = require.resolve('@deepseek-ai/dsh-api-gateway')
  const host = sources.get(hostPath)
  assert.match(host, /createHostGatewayDispatcher/)
  assert.ok(host.indexOf('super(ctx, "typertGateway")') < host.indexOf('const bidirectionalGateway'))
  assert.match(host, /new HostRemoteService\(ctx\)/)
  assert.match(host, /bidirectionalGateway\.invokeRpc/)

  const clientPath = require.resolve('@deepseek-ai/dsh-api-gateway/client')
  const client = sources.get(clientPath)
  assert.match(client, /require\("the-binding-of-dsh"\)\.installClientGateway\(ctx\)/)
})
