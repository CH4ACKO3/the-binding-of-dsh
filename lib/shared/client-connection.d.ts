import { type RpcResult, type ServerRequest } from './protocol.js';
export type ClientConnectionHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>;
export interface ClientConnectionGeneration {
    readonly id: string;
}
export interface ClientConnectionBinding {
    readonly intercept: (channel: string, matches: (endpoint: string) => boolean, handler: ClientConnectionHandler) => () => void;
    open(signal?: AbortSignal): Promise<ClientConnectionGeneration>;
    release(generation: ClientConnectionGeneration | undefined): void;
    handle(message: ServerRequest, generation: ClientConnectionGeneration | undefined): boolean;
}
export interface ClientConnectionBindingOptions {
    fetch?: typeof globalThis.fetch;
    baseUrl?: () => string;
    kind?: 'browser' | 'node';
}
export declare function createClientConnectionBinding(options?: ClientConnectionBindingOptions): ClientConnectionBinding;
declare module '@deepseek-ai/dsh-client-connection/client' {
    interface ClientConnectionRpc {
        intercept(channel: string, matches: (endpoint: string) => boolean, handler: ClientConnectionHandler): () => void;
    }
}
//# sourceMappingURL=client-connection.d.ts.map