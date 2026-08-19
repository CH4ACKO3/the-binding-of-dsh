import { createGatewayDispatcher } from './gateway-dispatcher.js';
export function installClientGateway(ctx) {
    const dispatcher = createGatewayDispatcher(ctx);
    const connection = ctx.get('connection');
    const dispose = connection.rpc.intercept('/api', endpoint => dispatcher.claimsEndpoint(endpoint), (endpoint, payload, signal) => dispatcher.invokeRpc(endpoint, payload, signal));
    ctx.effect(() => dispose, 'bidirectional-gateway.client.local');
}
//# sourceMappingURL=client-gateway.js.map