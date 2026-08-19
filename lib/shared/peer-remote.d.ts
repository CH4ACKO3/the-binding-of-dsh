import type { Context } from '@deepseek-ai/cordis';
import type { TypertDisposer, TypertRemoteContribution, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol';
import type { RpcResult } from './protocol.js';
export interface PeerRemoteApi extends TypertRemoteNamespaceMap {
}
export interface TypertRemoteCaller {
    call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>;
}
export interface HostPeerRemote {
    for(peer: TypertRemoteCaller): PeerRemoteApi;
    $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer>;
}
export declare class PeerRemoteProjector {
    private readonly ownerCtx;
    private readonly methods;
    private readonly bound;
    constructor(ownerCtx: Context);
    bind(peer: TypertRemoteCaller, callerCtx: Context): PeerRemoteApi;
    mount(callerCtx: Context, contribution: TypertRemoteContribution): Promise<TypertDisposer>;
    private withdraw;
}
//# sourceMappingURL=peer-remote.d.ts.map