export const CONNECTION_OPEN_PATH = '/api/connection.open';
export const CONNECTION_PEER_HEADER = 'x-dsh-connection-peer';
export const CONNECTION_RPC_METHOD = 'connection.rpc';
export const CONNECTION_CANCEL_METHOD = 'connection.cancel';
export const MAX_PENDING_CALLS = 256;
export const MAX_SEND_QUEUE_BYTES = 8 * 1024 * 1024;
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function rpcId(value) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}
export function isReverseRpcPayload(value) {
    const candidate = record(value);
    return candidate !== undefined
        && typeof candidate.channel === 'string'
        && candidate.channel !== ''
        && typeof candidate.endpoint === 'string'
        && candidate.endpoint !== ''
        && Object.hasOwn(candidate, 'payload');
}
export function parseRpcResult(value) {
    const candidate = record(value);
    if (candidate?.ok === true)
        return { ok: true, value: candidate.value };
    if (candidate?.ok !== false)
        return undefined;
    const error = record(candidate.error);
    if (error === undefined || typeof error.code !== 'string' || typeof error.message !== 'string'
        || !Object.hasOwn(error, 'details'))
        return undefined;
    return {
        ok: false,
        error: { code: error.code, message: error.message, details: error.details },
    };
}
export function parseClientControlFrame(value) {
    const candidate = record(value);
    const id = rpcId(candidate?.rpcId);
    if (candidate === undefined || id === undefined)
        return undefined;
    if (candidate.type === 'client-response') {
        const result = parseRpcResult(candidate.result);
        return result === undefined ? undefined : { type: 'client-response', rpcId: id, result };
    }
    if (candidate.type !== 'client-request')
        return undefined;
    if (candidate.method === CONNECTION_CANCEL_METHOD && candidate.payload === null) {
        return { type: 'client-request', rpcId: id, method: CONNECTION_CANCEL_METHOD, payload: null };
    }
    if (candidate.method === CONNECTION_RPC_METHOD && isReverseRpcPayload(candidate.payload)) {
        return { type: 'client-request', rpcId: id, method: CONNECTION_RPC_METHOD, payload: candidate.payload };
    }
    return undefined;
}
export function parseServerControlFrame(value) {
    const candidate = record(value);
    const id = rpcId(candidate?.rpcId);
    if (candidate === undefined || id === undefined)
        return undefined;
    if (candidate.type === 'server-response') {
        const result = parseRpcResult(candidate.result);
        return result === undefined ? undefined : { type: 'server-response', rpcId: id, result };
    }
    if (candidate.type !== 'server-request')
        return undefined;
    if (candidate.method === CONNECTION_CANCEL_METHOD && candidate.payload === null) {
        return { type: 'server-request', rpcId: id, method: CONNECTION_CANCEL_METHOD, payload: null };
    }
    if (candidate.method === CONNECTION_RPC_METHOD && isReverseRpcPayload(candidate.payload)) {
        return { type: 'server-request', rpcId: id, method: CONNECTION_RPC_METHOD, payload: candidate.payload };
    }
    return undefined;
}
export function isTbodServerFrame(value) {
    const candidate = record(value);
    return candidate?.type === 'server-response'
        || (candidate?.type === 'server-request'
            && (candidate.method === CONNECTION_RPC_METHOD || candidate.method === CONNECTION_CANCEL_METHOD));
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