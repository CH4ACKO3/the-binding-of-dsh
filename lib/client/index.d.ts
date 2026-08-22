import type { Context } from '@deepseek-ai/cordis';
import { installClientGateway } from '../shared/client-gateway.js';
export declare const inject: string[];
/** Browser entrypoint loaded after the native Connection and Typert registry. */
export declare function apply(ctx: Context): void;
export { createClientConnectionBinding } from '../shared/client-connection.js';
export { installClientGateway };
//# sourceMappingURL=index.d.ts.map