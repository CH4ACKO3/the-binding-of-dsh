const target = file => ({
  package: '@deepseek-ai/dsh-client-connection',
  version: '>=0.1.0-rc.7 <0.2.0',
  file,
})

const clientModulesTarget = file => ({
  package: '@deepseek-ai/dsh-client-modules',
  version: '>=0.1.0-rc.8 <0.2.0',
  file,
})

const bindingManifestPath = require.resolve('../package.json')

function variableStatement(node, ts) {
  let current = node
  while (current !== undefined && !ts.isVariableStatement(current)) current = current.parent
  if (current === undefined) throw new Error('VariableStatement ancestor not found')
  return current
}

/** @type {import('dsh-harmony').HarmonyPatch[]} */
module.exports = [
    {
      id: 'host-imports',
      description: 'Import the bidirectional Connection host binding.',
      target: target('lib/index.js'),
      select: 'SourceFile',
      expect: 1,
      apply({ edit }) {
        edit.prepend('import { HostConnectionBinding, sendConnectionMessage } from "the-binding-of-dsh/host/connection";\n')
      },
    },
    {
      id: 'host-service',
      description: 'Attach peer tracking and lifecycle cleanup to the Host Connection service.',
      target: target('lib/index.js'),
      select: 'VariableDeclaration[name.name="HostConnectionService"] ClassExpression Constructor Block',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        const first = node.statements[0]
        if (first === undefined || !first.getText(sourceFile).startsWith('super(')) {
          throw new Error('HostConnectionService constructor no longer starts with super()')
        }
        edit.appendRight(first.getEnd(), `
\t\tthis.bidirectional = new HostConnectionBinding();
\t\tthis.peers = this.bidirectional.peers;
\t\tctx.effect(() => () => this.bidirectional.dispose(), "client-connection: bidirectional peers");`)
      },
    },
    {
      id: 'host-internal-routes',
      description: 'Handle bidirectional Connection control requests on the native fetch route.',
      target: target('lib/index.js'),
      select: 'MethodDeclaration[name.name="createSharedFetchHandler"] ArrowFunction > Block',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.appendLeft(node.getStart(sourceFile) + 1, `
\t\t\tconst connectionResponse = this.bidirectional.fetch(request);
\t\t\tif (connectionResponse !== void 0) return connectionResponse;`)
      },
    },
    {
      id: 'host-serialized-writer',
      description: 'Serialize native downlink writes through the shared Connection sender.',
      target: target('lib/index.js'),
      select: 'FunctionDeclaration[name.name="send"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(
          node.getStart(sourceFile),
          node.getEnd(),
          'function send(socket, frame) {\n\treturn sendConnectionMessage(socket, serverRequest(frame));\n}',
        )
      },
    },
    {
      id: 'host-downlink-constructor',
      description: 'Provide the bidirectional binding to WebSocket downlinks.',
      target: target('lib/index.js'),
      select: 'VariableDeclaration[name.name="WebSocketDownlinks"] ClassExpression Constructor',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(
          node.getStart(sourceFile),
          node.getEnd(),
          'constructor(api, bidirectional) {\n\t\tthis.api = api;\n\t\tthis.bidirectional = bidirectional;\n\t}',
        )
      },
    },
    {
      id: 'host-mux-attachment',
      description: 'Identify mux WebSockets when upgrading Connection downlinks.',
      target: target('lib/index.js'),
      select: 'MethodDeclaration[name.name="handleMux"] CallExpression[expression.name.name="upgrade"]',
      expect: 1,
      apply({ node, edit }) {
        edit.appendLeft(node.getEnd() - 1, ', "mux"')
      },
    },
    {
      id: 'host-host-attachment',
      description: 'Identify host WebSockets when upgrading Connection downlinks.',
      target: target('lib/index.js'),
      select: 'MethodDeclaration[name.name="handleHost"] CallExpression[expression.name.name="upgrade"]',
      expect: 1,
      apply({ node, edit }) {
        edit.appendLeft(node.getEnd() - 1, ', "host"')
      },
    },
    {
      id: 'host-socket-attachment',
      description: 'Attach upgraded WebSockets to the bidirectional Connection binding.',
      target: target('lib/index.js'),
      select: 'MethodDeclaration[name.name="upgrade"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        const last = node.parameters.at(-1)
        if (last === undefined || node.body === undefined) throw new Error('upgrade method shape changed')
        edit.appendLeft(last.getEnd(), ', kind')
        const callback = node.body.statements[0].expression.arguments.at(-1)
        if (callback === undefined || callback.body === undefined) throw new Error('upgrade callback shape changed')
        edit.appendLeft(callback.body.getStart(sourceFile) + 1,
          '\n\t\t\tif (!this.bidirectional.attach(kind, req, websocket)) return;')
      },
    },
    {
      id: 'host-service-instance',
      description: 'Reuse one Host Connection service across fetch and downlink paths.',
      target: target('lib/index.js'),
      select: 'FunctionDeclaration[name.name="apply"] VariableDeclaration[name.name="fetchHandler"] NewExpression[expression.name="HostConnectionService"]',
      expect: 1,
      apply({ node, sourceFile, edit, ts }) {
        const statement = variableStatement(node, ts)
        edit.prependLeft(statement.getStart(sourceFile),
          'const connection = new HostConnectionService(ctx, trustedHosts);\n\t')
        edit.overwrite(node.getStart(sourceFile), node.getEnd(), 'connection')
      },
    },
    {
      id: 'host-downlink-instance',
      description: 'Connect WebSocket downlinks to the shared bidirectional binding.',
      target: target('lib/index.js'),
      select: 'FunctionDeclaration[name.name="apply"] NewExpression[expression.name="WebSocketDownlinks"]',
      expect: 1,
      apply({ node, edit }) {
        edit.appendLeft(node.getEnd() - 1, ', connection.bidirectional')
      },
    },
    {
      id: 'client-generation',
      description: 'Open a bidirectional peer generation with the native Connection socket.',
      target: target('lib/client.js'),
      select: 'MethodDeclaration[name.name="readWebSocket"] > Block',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.appendLeft(node.getStart(sourceFile) + 1,
          '\n\t\t\t\tconst generation = await this.bidirectional?.open(signal);')
      },
    },
    {
      id: 'client-socket-protocol',
      description: 'Send the peer generation id as the Connection WebSocket subprotocol.',
      target: target('lib/client.js'),
      select: 'MethodDeclaration[name.name="readWebSocket"] VariableDeclaration[name.name="socket"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        const initializer = node.initializer
        if (initializer === undefined) throw new Error('socket initializer missing')
        edit.overwrite(initializer.getStart(sourceFile), initializer.getEnd(),
          'generation === void 0 ? new WebSocket(url) : new WebSocket(url, generation.id)')
      },
    },
    {
      id: 'client-control-dispatch',
      description: 'Dispatch bidirectional control frames before native Connection messages.',
      target: target('lib/client.js'),
      select: 'MethodDeclaration[name.name="readWebSocket"] BinaryExpression[left.name="frame"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.prependLeft(node.parent.getStart(sourceFile),
          'if (this.bidirectional?.handle(full, generation) === true) return;\n\t\t\t\t\t\t')
      },
    },
    {
      id: 'client-generation-release',
      description: 'Release the peer generation when the native socket closes.',
      target: target('lib/client.js'),
      select: 'MethodDeclaration[name.name="readWebSocket"] TryStatement > Block:has(CallExpression[expression.name.name="removeEventListener"])',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.appendLeft(node.getStart(sourceFile) + 1,
          '\n\t\t\t\t\tthis.bidirectional?.release(generation);')
      },
    },
    {
      id: 'client-binding',
      description: 'Expose the browser bidirectional binding and RPC interception API.',
      target: target('lib/client.js'),
      select: 'FunctionDeclaration[name.name="apply"] VariableDeclaration[name.name="rpc"]',
      expect: 1,
      apply({ node, sourceFile, edit, ts }) {
        const statement = variableStatement(node, ts)
        edit.appendRight(statement.getEnd(), `
\n\t\t\tconst bidirectional = fixtureClient === void 0
\t\t\t\t? require("the-binding-of-dsh").createClientConnectionBinding()
\t\t\t\t: void 0;
\t\t\tif (bidirectional !== void 0) {
\t\t\t\tapi.bidirectional = bidirectional;
\t\t\t\trpc.intercept = bidirectional.intercept;
\t\t\t}`)
      },
    },
    {
      id: 'client-module-provider-resolution',
      description: 'Resolve the nested Binding provider when composing the client module graph.',
      target: clientModulesTarget('lib/index.js'),
      select: 'MethodDeclaration[name.name="resolveMeta"] CallExpression[expression.name.name="resolvePkgJson"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(node.getStart(sourceFile), node.getEnd(),
          `pkgName === "the-binding-of-dsh" ? ${JSON.stringify(bindingManifestPath)} : ${node.getText(sourceFile)}`)
      },
    },
    {
      id: 'client-module-graph-external',
      description: 'Order the Binding factory before the patched Connection factory.',
      target: clientModulesTarget('lib/index.js'),
      select: 'MethodDeclaration[name.name="resolveMeta"] VariableDeclaration[name.name="meta"] PropertyAssignment[name.name="external"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        const initializer = node.initializer
        if (initializer === undefined) throw new Error('Client module external initializer missing')
        edit.overwrite(initializer.getStart(sourceFile), initializer.getEnd(), `
pkgName === "@deepseek-ai/dsh-client-connection"
	? decl.external?.includes("the-binding-of-dsh")
		? decl.external
		: [...(decl.external ?? []), "the-binding-of-dsh"]
	: decl.external ?? []`)
      },
    },
]
