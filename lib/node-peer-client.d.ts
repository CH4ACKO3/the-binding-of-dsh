import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { type PeerRemoteApi } from './shared/peer-remote.js';
import { type ClientConnectionHandler } from './shared/client-connection.js';
interface WebSocketLike {
    readonly readyState: number;
    readonly bufferedAmount?: number;
    addEventListener(event: 'open' | 'close' | 'error', listener: (event: Event) => void, options?: {
        once?: boolean;
    }): void;
    addEventListener(event: 'message', listener: (event: {
        data: unknown;
    }) => void): void;
    removeEventListener(event: 'open' | 'close' | 'error', listener: (event: Event) => void): void;
    send(data: string): void;
    close(): void;
}
export interface NodePeerClientOptions {
    readonly baseUrl: string | URL;
    readonly contribution: TypertRemoteContribution;
    readonly fetch?: typeof globalThis.fetch;
    readonly createWebSocket?: (url: string, protocol: string) => WebSocketLike;
}
export interface NodePeerClientHandle {
    readonly remote: PeerRemoteApi;
    intercept(channel: string, matches: (endpoint: string) => boolean, handler: ClientConnectionHandler): () => void;
    connect(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export declare class NodePeerClient implements NodePeerClientHandle {
    private readonly ctx;
    private readonly fetch;
    private readonly baseUrl;
    private readonly contribution;
    private readonly createWebSocket;
    private readonly connection;
    private readonly projector;
    private readonly caller;
    private generation;
    private mounting;
    private disposeRemote;
    private connecting;
    private opening;
    readonly remote: PeerRemoteApi;
    constructor(options: NodePeerClientOptions);
    intercept(channel: string, matches: (endpoint: string) => boolean, handler: ClientConnectionHandler): () => void;
    connect(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
    private dropGeneration;
    private withdrawRemote;
    private open;
    private call;
    private fail;
}
export {};
//# sourceMappingURL=node-peer-client.d.ts.map