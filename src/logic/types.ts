/** MCPGate types — remote MCP gateway control plane */

export interface ApiKeyRecord {
  /** Bearer token value */
  key: string;
  /** Display label */
  label: string;
  /** Max requests per window */
  rpm: number;
  /** Optional allow-list of server ids; empty = all */
  servers: string[];
}

export type UpstreamKind = "builtin" | "http";

export interface UpstreamServer {
  id: string;
  kind: UpstreamKind;
  /** Required when kind=http */
  url?: string;
  description?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  keyLabel: string;
  serverId: string;
  method: string;
  toolName?: string;
  status: number;
  durationMs: number;
  error?: string;
  clientIp?: string;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function newId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
