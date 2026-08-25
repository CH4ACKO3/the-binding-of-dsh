import { HostRemoteService } from './host/gateway.js';
export const name = 'the-binding-of-dsh';
export const inject = ['typert'];
/** Host entrypoint exposing peer-bound Remote calls. */
export function apply(ctx) {
    ctx.inject(['harmony'], (harmonyCtx) => {
        new HostRemoteService(harmonyCtx);
    });
}
export { NodePeerClient } from './node-peer-client.js';
export { createHostFetchDispatcher, HostConnectionBinding, sendConnectionMessage, } from './host/connection.js';
export { createHostGatewayDispatcher, } from './host/gateway.js';
export { HostRemoteService };
export { GatewayDispatchError, createGatewayDispatcher, } from './shared/gateway-dispatcher.js';
export { installClientGateway } from './shared/client-gateway.js';
//# sourceMappingURL=index.js.map