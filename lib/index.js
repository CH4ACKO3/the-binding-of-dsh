export const name = 'the-binding-of-dsh';
export const inject = ['harmony'];
/** Host entrypoint. Connection and Gateway hooks are added by Harmony patches. */
export function apply() { }
export { NodePeerClient } from './node-peer-client.js';
export { HostConnectionBinding, sendConnectionMessage, } from './host/connection.js';
export { createHostGatewayDispatcher, HostRemoteService, } from './host/gateway.js';
export { GatewayDispatchError, createGatewayDispatcher, } from './shared/gateway-dispatcher.js';
export { installClientGateway } from './shared/client-gateway.js';
//# sourceMappingURL=index.js.map