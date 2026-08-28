import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tsquery } from '@phenomnomnominal/tsquery'
import MagicString from 'magic-string'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const declaration = require('../patches/connection.patch.cjs')
const members = declaration.flatMap(patch => patch.patches ?? [patch])

test('describes every Harmony patch', () => {
  for (const patch of [...declaration, ...members]) {
    assert.equal(typeof patch.description, 'string', `${patch.id} description type`)
    assert.notEqual(patch.description.trim(), '', `${patch.id} description`)
  }
})

test('ships one atomic Harmony patch for the complete integration', () => {
  assert.equal(declaration.length, 1)
  assert.equal(declaration[0].id, 'bidirectional-connection')
  assert.equal(declaration[0].patches.length, 16)
})

function targetPath(member) {
  const packagePath = require.resolve(`${member.target.package}/package.json`)
  return fileURLToPath(new URL(member.target.file, pathToFileURL(packagePath)))
}

async function applyPatch(declaration) {
  const sources = new Map()
  for (const member of declaration) {
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

test('Connection Harmony patch binds and produces parseable sources', async () => {
  assert.equal(members.length, 16)
  assert.equal(
    members.filter(patch => patch.target.package === '@deepseek-ai/dsh-client-connection').length,
    16,
  )
  const sources = await applyPatch(members)
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
  assert.match(host, /if \(kind === "mux"\) websocket\.once\("message"/)
  assert.match(host, /setDispatcher\(createHostFetchDispatcher\(fetchHandler\)\)/)
  assert.match(host, /new WebSocketDownlinks\(apiCtx\.apiProxy, connection\.bidirectional\)/)

  const clientPath = require.resolve('@deepseek-ai/dsh-client-connection/client')
  const client = sources.get(clientPath)
  assert.match(client, /await this\.bidirectional\?\.open\(signal\)/)
  assert.match(client, /new WebSocket\(url, generation\.id\)/)
  assert.match(client, /this\.bidirectional\?\.attach\(generation, "host", socket\)/)
  assert.match(client, /this\.bidirectional\?\.handle\(raw, generation\)/)
  assert.match(client, /require\("the-binding-of-dsh"\)\.createClientConnectionBinding\(\)/)
  assert.match(client, /rpc\.call = bidirectional\.call/)
})
