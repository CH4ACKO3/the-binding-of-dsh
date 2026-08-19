export const CONNECTION_OPEN_PATH = '/api/connection.open'
export const CONNECTION_RESPOND_PATH = '/api/respond'
export const CONNECTION_PEER_HEADER = 'x-dsh-connection-peer'
export const CONNECTION_RPC_HEADER = 'x-dsh-connection-rpc'
export const CONNECTION_RPC_METHOD = 'connection.rpc'
export const CONNECTION_CANCEL_METHOD = 'connection.cancel'

export interface ReverseRpcPayload {
  channel: string
  endpoint: string
  payload: unknown
}

export interface RpcError {
  code: string
  message: string
  details: unknown
}

export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RpcError }

export interface ServerRequest {
  type: 'server-request'
  rpcId: string
  method: string
  payload: unknown
}

export interface ClientResponse {
  type: 'client-response'
  rpcId: string
  result: RpcResult<unknown>
}

export function isReverseRpcPayload(value: unknown): value is ReverseRpcPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ReverseRpcPayload>
  return typeof candidate.channel === 'string'
    && typeof candidate.endpoint === 'string'
    && Object.hasOwn(candidate, 'payload')
}

export function internalFailure(error: unknown): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: 'internal',
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  }
}
