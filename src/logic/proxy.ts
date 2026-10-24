import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { handleBuiltinMcp } from "./builtin-mcp.js";
import type { UpstreamServer } from "./types.js";

export interface ProxyResult {
  status: number;
  body: JsonRpcResponse | unknown;
  contentType: string;
}

export interface ProxyOptions {
  fetchImpl?: typeof fetch;
  /** Upstream request timeout ms (default 15s) */
  timeoutMs?: number;
  /** Forward Authorization / custom headers */
  headers?: Record<string, string>;
}

/**
 * Route JSON-RPC to builtin handler or HTTP upstream MCP endpoint.
 */
export async function dispatchMcp(
  upstream: UpstreamServer,
  req: JsonRpcRequest,
  options: ProxyOptions | typeof fetch = fetch,
): Promise<ProxyResult> {
  // Back-compat: third arg may be fetch impl
  const opts: ProxyOptions =
    typeof options === "function" ? { fetchImpl: options } : options;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs =
    opts.timeoutMs ??
    (Number(process.env.MCPGATE_UPSTREAM_TIMEOUT_MS) || 15_000);

  if (upstream.kind === "builtin") {
    return {
      status: 200,
      body: handleBuiltinMcp(req),
      contentType: "application/json",
    };
  }

  if (!upstream.url) {
    return {
      status: 500,
      body: {
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: { code: -32000, message: "Upstream URL not configured" },
      },
      contentType: "application/json",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...opts.headers,
    };
    // Optional: forward HA / upstream token
    if (process.env.MCPGATE_UPSTREAM_AUTH) {
      headers.Authorization = process.env.MCPGATE_UPSTREAM_AUTH.startsWith("Bearer")
        ? process.env.MCPGATE_UPSTREAM_AUTH
        : `Bearer ${process.env.MCPGATE_UPSTREAM_AUTH}`;
    }

    const res = await fetchImpl(upstream.url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: req.jsonrpc ?? "2.0",
        id: req.id ?? null,
        method: req.method,
        params: req.params,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep text — may be SSE error body
    }

    return {
      status: res.status,
      body,
      contentType: res.headers.get("content-type") || "application/json",
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      status: 504,
      body: {
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: {
          code: -32002,
          message: aborted
            ? `Upstream timeout after ${timeoutMs}ms`
            : e instanceof Error
              ? e.message
              : String(e),
        },
      },
      contentType: "application/json",
    };
  } finally {
    clearTimeout(timer);
  }
}
