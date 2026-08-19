export const name = 'the-binding-of-dsh'
export const inject = ['harmony']

/** Host entrypoint. Connection and Gateway hooks are added by Harmony patches. */
export function apply(): void {}

export {
  HostConnectionBinding,
  sendConnectionMessage,
} from './host/connection.js'
export {
  createHostGatewayDispatcher,
  HostRemoteService,
} from './host/gateway.js'
export {
  GatewayDispatchError,
  createGatewayDispatcher,
} from './shared/gateway-dispatcher.js'
export { installClientGateway } from './shared/client-gateway.js'
export type {
  ConnectionPeer,
  HostConnectionPeers,
  PeerChange,
  ReverseConnectionHost,
} from './host/connection.js'
export type {
  GatewayDispatcher,
  GatewayErrorCode,
  GatewayErrorOptions,
  GatewayRequest,
} from './shared/gateway-dispatcher.js'
export type {
  HostPeerRemote,
  PeerRemoteApi,
} from './shared/peer-remote.js'
