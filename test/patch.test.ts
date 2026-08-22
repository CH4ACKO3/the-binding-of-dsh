import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
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
  assert.equal(declaration[0].patches.length, 17)
})

function targetPath(member) {
  const packagePath = require.resolve(`${member.target.package}/package.json`)
  return new URL(member.target.file, `file://${packagePath}`).pathname
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
  assert.equal(members.length, 17)
  assert.equal(
    members.filter(patch => patch.target.package === '@deepseek-ai/dsh-client-connection').length,
    15,
  )
  assert.equal(
    members.filter(patch => patch.target.package === '@deepseek-ai/dsh-client-modules').length,
    2,
  )
  const sources = await applyPatch(members)
  assert.equal(sources.size, 3)
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

  const modulesPath = require.resolve('@deepseek-ai/dsh-client-modules')
  const modules = sources.get(modulesPath)
  const sourceFile = ts.createSourceFile(modulesPath, modules, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const external = tsquery(
    sourceFile,
    'MethodDeclaration[name.name="resolveMeta"] VariableDeclaration[name.name="meta"] PropertyAssignment[name.name="external"]',
  )
  assert.equal(external.length, 1)
  const resolveExternal = new Function(
    'pkgName',
    'decl',
    `return (${external[0].initializer.getText(sourceFile)})`,
  )
  assert.deepEqual(resolveExternal('@deepseek-ai/dsh-client-connection', {}), ['the-binding-of-dsh'])
  assert.deepEqual(
    resolveExternal('@deepseek-ai/dsh-client-connection', { external: ['other'] }),
    ['other', 'the-binding-of-dsh'],
  )
  assert.deepEqual(
    resolveExternal('@deepseek-ai/dsh-client-connection', { external: ['the-binding-of-dsh'] }),
    ['the-binding-of-dsh'],
  )
  assert.deepEqual(resolveExternal('other-package', {}), [])

  const runtimeRoot = await mkdtemp(join(tmpdir(), 'the-binding-of-dsh-client-graph-'))
  try {
    await symlink(resolve('node_modules'), join(runtimeRoot, 'node_modules'), 'dir')
    const runtimePath = join(runtimeRoot, 'client-modules.mjs')
    await writeFile(runtimePath, modules)
    const { ClientModuleRegistry } = await import(pathToFileURL(runtimePath).href)
    const names = [
      '@deepseek-ai/dsh-client-connection',
      'the-binding-of-dsh',
    ]
    const registry = Object.create(ClientModuleRegistry.prototype)
    registry.pkgMeta = new Map()
    registry.table = new Map()
    registry.ctx = {
      loader: {
        entries: () => names.map(name => ({ options: { name }, fiber: {}, disabled: false })),
      },
    }
    registry.resolvePkgJson = (name) => {
      if (name === 'the-binding-of-dsh') throw new Error('not installed at the profile root')
      return require.resolve(`${name}/package.json`)
    }
    registry.initialBundleRevision = () => 'test-rev'

    assert.equal(registry.processOne('@deepseek-ai/dsh-client-connection'), true)
    assert.equal(registry.processOne('the-binding-of-dsh'), true)
    const graph = registry.compose()
    assert.deepEqual(graph.entries.map(entry => entry.id), [
      'the-binding-of-dsh',
      '@deepseek-ai/dsh-client-connection',
    ])
    assert.deepEqual(
      graph.entries.find(entry => entry.id === '@deepseek-ai/dsh-client-connection').external,
      ['the-binding-of-dsh'],
    )
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true })
  }
})
