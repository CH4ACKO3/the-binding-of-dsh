import type { Context } from '@deepseek-ai/cordis'
import { createGatewayDispatcher } from './gateway-dispatcher.js'

export function installClientGateway(ctx: Context): void {
  type Dispatcher = ReturnType<typeof createGatewayDispatcher>
  const connection = ctx.get('connection') as unknown as {
    rpc: {
      intercept?: (
        channel: string,
        matches: (endpoint: string) => boolean,
        handler: (
          endpoint: string,
          payload: unknown,
          signal: AbortSignal,
        ) => ReturnType<Dispatcher['invokeRpc']>,
      ) => () => void
    }
  }
  if (typeof connection.rpc.intercept !== 'function') return

  const dispatcher = createGatewayDispatcher(ctx)
  const dispose = connection.rpc.intercept(
    '/api',
    endpoint => dispatcher.claimsEndpoint(endpoint),
    (endpoint, payload, signal) => dispatcher.invokeRpc(endpoint, payload, signal),
  )
  ctx.effect(() => dispose, 'bidirectional-gateway.client.local')
}
