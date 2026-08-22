import type { Context } from '@deepseek-ai/cordis'
import { HostRemoteService } from './host/gateway.js'

export const name = 'the-binding-of-dsh'
export const inject = ['harmony', 'typert']

/** Host entrypoint exposing peer-bound Remote calls. */
export function apply(ctx: Context): void {
  new HostRemoteService(ctx)
}

export { NodePeerClient } from './node-peer-client.js'
export type {
  NodePeerClientHandle,
  NodePeerClientOptions,
} from './node-peer-client.js'

export {
  HostConnectionBinding,
  sendConnectionMessage,
} from './host/connection.js'
export {
  createHostGatewayDispatcher,
} from './host/gateway.js'
export { HostRemoteService }
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
  TypertRemoteCaller,
} from './shared/peer-remote.js'
