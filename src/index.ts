export const name = 'the-binding-of-dsh'
export const inject = ['harmony']

/** Host entrypoint. Connection and Gateway hooks are added by Harmony patches. */
export function apply(): void {}

export {
  HostConnectionBinding,
  sendConnectionMessage,
} from './host/connection.js'
export type {
  ConnectionPeer,
  HostConnectionPeers,
  PeerChange,
  ReverseConnectionHost,
} from './host/connection.js'
