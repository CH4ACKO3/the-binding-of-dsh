import { type HostFrame, type MuxFrame, type RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api';
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { type PeerRemoteApi } from './shared/peer-remote.js';
export type BrowserPeerChannel = 'mux' | 'host';
export type BrowserPeerEvent = {
    channel: 'mux';
    envelope: RpcRequest<MuxFrame>;
} | {
    channel: 'host';
    envelope: RpcRequest<HostFrame>;
};
export interface BrowserPeerClientOptions {
    readonly baseUrl?: string | URL;
    readonly contribution: TypertRemoteContribution;
    readonly fetch?: typeof globalThis.fetch;
    readonly createWebSocket?: (url: string, protocol: string) => WebSocket;
}
/** Standalone browser owner for one native DSH Connection and both event streams. */
export declare class BrowserPeerClient {
    private readonly ctx;
    private readonly fetch;
    private readonly baseUrl;
    private readonly contribution;
    private readonly createWebSocket;
    private readonly connection;
    private readonly projector;
    private readonly caller;
    private readonly eventListeners;
    private readonly stateListeners;
    private generation;
    private mounting;
    private disposeRemote;
    private connecting;
    private opening;
    readonly remote: PeerRemoteApi;
    constructor(options: BrowserPeerClientOptions);
    get connected(): boolean;
    connect(signal?: AbortSignal): Promise<void>;
    onEvent(listener: (event: BrowserPeerEvent) => void): () => void;
    onState(listener: (connected: boolean) => void): () => void;
    close(): Promise<void>;
    private open;
    private attach;
    private fail;
    private dropGeneration;
    private emitState;
    private call;
}
//# sourceMappingURL=browser-peer-client.d.ts.map