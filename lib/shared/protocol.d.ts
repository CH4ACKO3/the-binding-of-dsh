export declare const CONNECTION_OPEN_PATH = "/api/connection.open";
export declare const CONNECTION_RESPOND_PATH = "/api/respond";
export declare const CONNECTION_PEER_HEADER = "x-dsh-connection-peer";
export declare const CONNECTION_RPC_HEADER = "x-dsh-connection-rpc";
export declare const CONNECTION_RPC_METHOD = "connection.rpc";
export declare const CONNECTION_CANCEL_METHOD = "connection.cancel";
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
export interface ServerRequest {
    type: 'server-request';
    rpcId: string;
    method: string;
    payload: unknown;
}
export interface ClientResponse {
    type: 'client-response';
    rpcId: string;
    result: RpcResult<unknown>;
}
export declare function isReverseRpcPayload(value: unknown): value is ReverseRpcPayload;
export declare function internalFailure(error: unknown): RpcResult<never>;
//# sourceMappingURL=protocol.d.ts.map