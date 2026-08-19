import type { Context } from '@deepseek-ai/cordis';
import type { RemoteMethodMarker, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import type { RpcError, RpcResult } from './protocol.js';
export type GatewayErrorCode = 'ambiguous-endpoint' | 'arguments-invalid' | 'binding-invalid' | 'context-failed' | 'context-not-found' | 'context-unavailable' | 'definition-unavailable' | 'input-invalid' | 'invocation-unavailable' | 'lookup-failed' | 'lookup-not-found' | 'lookup-unavailable' | 'method-unavailable' | 'provider-mismatch' | 'result-invalid' | 'service-unavailable' | 'signature-invalid';
export interface GatewayErrorOptions {
    readonly cause?: unknown;
    readonly field?: string;
}
export declare class GatewayDispatchError extends Error {
    readonly code: GatewayErrorCode;
    readonly endpoint: string;
    readonly field: string | undefined;
    constructor(code: GatewayErrorCode, endpoint: string, message: string, options?: GatewayErrorOptions);
}
interface GatewayRuntime {
    readonly createError?: (code: GatewayErrorCode, endpoint: string, message: string, options?: GatewayErrorOptions) => Error;
    readonly remoteMethods?: (service: object) => readonly RemoteMethodMarker[];
    readonly lookupFailure?: (error: unknown) => RpcError | undefined;
}
export interface GatewayRequest {
    readonly namespace: string;
    readonly method: string;
    readonly args: Readonly<Record<string, unknown>>;
    readonly signal?: AbortSignal;
}
export interface GatewayDispatcher {
    claimsEndpoint(endpoint: string): boolean;
    invoke(request: GatewayRequest): Promise<unknown>;
    invokeRpc(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>>;
}
export declare function createGatewayDispatcher(ctx: Context, runtime?: GatewayRuntime): GatewayDispatcher;
export declare function parseGatewayValue(codec: TypertCodec, value: unknown, endpoint: string, field: string): unknown;
export {};
//# sourceMappingURL=gateway-dispatcher.d.ts.map