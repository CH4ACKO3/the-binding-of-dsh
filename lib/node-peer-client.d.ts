import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { type PeerRemoteApi } from './shared/peer-remote.js';
interface WebSocketLike {
    readonly readyState: number;
    addEventListener(event: 'open' | 'close' | 'error', listener: (event: Event) => void, options?: {
        once?: boolean;
    }): void;
    removeEventListener(event: 'open' | 'close' | 'error', listener: (event: Event) => void): void;
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
    connect(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export declare class NodePeerClient implements NodePeerClientHandle {
    private readonly ctx;
    private readonly fetch;
    private readonly baseUrl;
    private readonly contribution;
    private readonly createWebSocket;
    private readonly projector;
    private readonly caller;
    private generation;
    private mounting;
    private disposeRemote;
    private connecting;
    private opening;
    readonly remote: PeerRemoteApi;
    constructor(options: NodePeerClientOptions);
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