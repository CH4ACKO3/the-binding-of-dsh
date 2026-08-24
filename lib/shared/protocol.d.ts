export declare const CONNECTION_OPEN_PATH = "/api/connection.open";
export declare const CONNECTION_PEER_HEADER = "x-dsh-connection-peer";
export declare const CONNECTION_RPC_METHOD = "connection.rpc";
export declare const CONNECTION_CANCEL_METHOD = "connection.cancel";
export declare const MAX_PENDING_CALLS = 256;
export declare const MAX_SEND_QUEUE_BYTES: number;
export interface ReverseRpcPayload {
    channel: string;
    endpoint: string;
    payload: unknown;
}
export interface RpcError {
    code: string;
    message: string;
    details: unknown;
}
export type RpcResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: RpcError;
};
export type ServerRequest = {
    type: 'server-request';
    rpcId: string;
    method: typeof CONNECTION_RPC_METHOD;
    payload: ReverseRpcPayload;
} | {
    type: 'server-request';
    rpcId: string;
    method: typeof CONNECTION_CANCEL_METHOD;
    payload: null;
};
export interface ServerResponse {
    type: 'server-response';
    rpcId: string;
    result: RpcResult<unknown>;
}
export type ClientRequest = {
    type: 'client-request';
    rpcId: string;
    method: typeof CONNECTION_RPC_METHOD;
    payload: ReverseRpcPayload;
} | {
    type: 'client-request';
    rpcId: string;
    method: typeof CONNECTION_CANCEL_METHOD;
    payload: null;
};
export interface ClientResponse {
    type: 'client-response';
    rpcId: string;
    result: RpcResult<unknown>;
}
export type ClientControlFrame = ClientRequest | ClientResponse;
export type ServerControlFrame = ServerRequest | ServerResponse;
export declare function isReverseRpcPayload(value: unknown): value is ReverseRpcPayload;
export declare function parseRpcResult(value: unknown): RpcResult<unknown> | undefined;
export declare function parseClientControlFrame(value: unknown): ClientControlFrame | undefined;
export declare function parseServerControlFrame(value: unknown): ServerControlFrame | undefined;
export declare function isTbodServerFrame(value: unknown): boolean;
export declare function internalFailure(error: unknown): RpcResult<never>;
//# sourceMappingURL=protocol.d.ts.map