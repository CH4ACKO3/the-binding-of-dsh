const target = files => ({
  package: '@deepseek-ai/dsh-api-gateway',
  version: '^0.1.0-rc.7',
  files,
})

/** @type {import('dsh-harmony').HarmonyPatch[]} */
module.exports = [
    {
      id: 'gateway-host-imports',
      target: target(['lib/index.js']),
      select: 'SourceFile',
      expect: 1,
      apply({ edit }) {
        edit.prepend('import { createHostGatewayDispatcher, HostRemoteService } from "the-binding-of-dsh/host/gateway";\n')
      },
    },
    {
      id: 'gateway-host-shared-dispatcher-and-remote',
      target: target(['lib/index.js']),
      select: 'VariableDeclaration[name.name="TypertGatewayService"] ClassExpression Constructor > Block',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        const first = node.statements[0]
        if (first === undefined || !first.getText(sourceFile).startsWith('super(')) {
          throw new Error('TypertGatewayService constructor no longer starts with super()')
        }
        edit.appendRight(first.getEnd(), `
\t\tconst bidirectionalGateway = createHostGatewayDispatcher(
\t\t\tctx,
\t\t\t(code, endpoint, message, options) => new TypertGatewayError(code, endpoint, message, options),
\t\t);
\t\tthis.claimsEndpoint = endpoint => bidirectionalGateway.claimsEndpoint(endpoint);
\t\tthis.invoke = request => bidirectionalGateway.invoke(request);
\t\tthis.dispatchRpc = (endpoint, payload, signal) => bidirectionalGateway.invokeRpc(endpoint, payload, signal);
\t\tthis.invokeRpc = (endpoint, payload, signal) => bidirectionalGateway.invokeRpc(endpoint, payload, signal);
\t\tnew HostRemoteService(ctx);`)
      },
    },
    {
      id: 'gateway-client-local-dispatcher',
      target: target(['lib/client.js']),
      select: 'FunctionDeclaration[name.name="apply"] > Block',
      expect: 1,
      apply({ node, edit }) {
        edit.appendLeft(
          node.getEnd() - 1,
          '\n\t\t\trequire("the-binding-of-dsh").installClientGateway(ctx);\n\t\t',
        )
      },
    },
]
