import { type RpcResult, type ServerRequest } from '../shared/protocol.js';
export interface ConnectionPeer {
    readonly id: string;
    readonly kind: 'browser' | 'node';
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>;
}
export type PeerChange = {
    type: 'added';
    peer: ConnectionPeer;
} | {
    type: 'removed';
    peer: ConnectionPeer;
};
export interface HostConnectionPeers {
    get(id: string): ConnectionPeer | undefined;
    list(): readonly ConnectionPeer[];
    subscribe(listener: (change: PeerChange) => void): () => void;
}
interface SocketLike {
    readonly readyState: number;
    send(data: string, callback: (error?: Error | null) => void): void;
    close(code?: number, reason?: string): void;
    once(event: 'close' | 'error', listener: () => void): void;
}
export declare function sendConnectionMessage(socket: SocketLike, message: ServerRequest): Promise<void>;
export interface ReverseConnectionHost {
    readonly peers: HostConnectionPeers;
    fetch(request: Request): Promise<Response> | undefined;
    attach(kind: 'mux' | 'host', request: {
        headers: Record<string, unknown>;
    }, socket: SocketLike): boolean;
    dispose(): void;
}
export declare class HostConnectionBinding implements ReverseConnectionHost {
    private readonly generations;
    private readonly published;
    private readonly listeners;
    readonly peers: HostConnectionPeers;
    fetch(request: Request): Promise<Response> | undefined;
    attach(kind: 'mux' | 'host', request: {
        headers: Record<string, unknown>;
    }, socket: SocketLike): boolean;
    dispose(): void;
    private open;
    private respond;
    private publish;
    private call;
    private fail;
    private emit;
}
declare module '@deepseek-ai/dsh-client-connection' {
    interface HostConnectionHandle {
        readonly peers: HostConnectionPeers;
    }
}
export {};
//# sourceMappingURL=connection.d.ts.map