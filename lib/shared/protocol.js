export const CONNECTION_OPEN_PATH = '/api/connection.open';
export const CONNECTION_RESPOND_PATH = '/api/respond';
export const CONNECTION_PEER_HEADER = 'x-dsh-connection-peer';
export const CONNECTION_RPC_HEADER = 'x-dsh-connection-rpc';
export const CONNECTION_RPC_METHOD = 'connection.rpc';
export const CONNECTION_CANCEL_METHOD = 'connection.cancel';
export function isReverseRpcPayload(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const candidate = value;
    return typeof candidate.channel === 'string'
        && typeof candidate.endpoint === 'string'
        && Object.hasOwn(candidate, 'payload');
}
export function internalFailure(error) {
    return {
        ok: false,
        error: {
            code: 'internal',
            message: error instanceof Error ? error.message : String(error),
            details: {},
        },
    };
}
//# sourceMappingURL=protocol.js.map