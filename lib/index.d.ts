export declare const name = "the-binding-of-dsh";
export declare const inject: string[];
/** Host entrypoint. Connection and Gateway hooks are added by Harmony patches. */
export declare function apply(): void;
export { NodePeerClient } from './node-peer-client.js';
export type { NodePeerClientHandle, NodePeerClientOptions, } from './node-peer-client.js';
export { HostConnectionBinding, sendConnectionMessage, } from './host/connection.js';
export { createHostGatewayDispatcher, HostRemoteService, } from './host/gateway.js';
export { GatewayDispatchError, createGatewayDispatcher, } from './shared/gateway-dispatcher.js';
export { installClientGateway } from './shared/client-gateway.js';
export type { ConnectionPeer, HostConnectionPeers, PeerChange, ReverseConnectionHost, } from './host/connection.js';
export type { GatewayDispatcher, GatewayErrorCode, GatewayErrorOptions, GatewayRequest, } from './shared/gateway-dispatcher.js';
export type { HostPeerRemote, PeerRemoteApi, TypertRemoteCaller, } from './shared/peer-remote.js';
//# sourceMappingURL=index.d.ts.map