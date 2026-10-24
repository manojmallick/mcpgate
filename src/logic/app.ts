import { Hono } from "hono";
import { AuditLog } from "./audit.js";
import { extractToolName } from "./builtin-mcp.js";
import {
  findKey,
  findUpstream,
  loadConfig,
  type GateConfig,
} from "./config.js";
import { dispatchMcp } from "./proxy.js";
import { RateLimiter } from "./ratelimit.js";
import type { JsonRpcRequest } from "./types.js";

// Shared across AWS Lambda, Cloudflare Workers, GCP Cloud Run, local dev.
export const app = new Hono();

let config: GateConfig = loadConfig();
const limiter = new RateLimiter(config.rateLimitWindowMs);
const audit = new AuditLog(config.auditMax);

/** Test / hot-reload helper */
export function reloadConfig(next?: GateConfig) {
  config = next ?? loadConfig();
  limiter.reset();
  audit.clear();
}

export function getAudit() {
  return audit;
}

function bearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m?.[1]?.trim() || null;
}

function clientIp(c: {
  req: { header: (n: string) => string | undefined };
}): string | undefined {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    undefined
  );
}

app.get("/", (c) =>
  c.json({
    name: "MCPGate",
    tagline:
      "One-command remote MCP: auth · rate-limit · audit-log · multi-cloud",
    endpoints: {
      health: "GET /health",
      servers: "GET /v1/servers",
      mcp: "POST /v1/mcp/:serverId  (Authorization: Bearer <api-key>)",
      audit: "GET /v1/audit  (Authorization: Bearer <admin>)",
      stats: "GET /v1/stats  (Authorization: Bearer <admin>)",
    },
    servers: config.upstreams.map((u) => ({
      id: u.id,
      kind: u.kind,
      description: u.description,
    })),
    pricingThesis: "OSS gateway + $12–39/mo control plane · yr-1 $10–40K ARR",
  }),
);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    servers: config.upstreams.length,
    keys: config.apiKeys.length,
    audit: audit.stats().total,
    time: new Date().toISOString(),
  }),
);

app.get("/v1/servers", (c) => {
  return c.json({
    servers: config.upstreams.map((u) => ({
      id: u.id,
      kind: u.kind,
      description: u.description,
      path: `/v1/mcp/${u.id}`,
    })),
  });
});

function isAdmin(authHeader: string | undefined): boolean {
  const token = bearer(authHeader);
  return !!token && token === config.adminToken;
}

app.get("/v1/audit", (c) => {
  if (!isAdmin(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const limit = Math.min(200, Number(c.req.query("limit") ?? 50) || 50);
  return c.json({ entries: audit.list(limit) });
});

app.get("/v1/stats", (c) => {
  if (!isAdmin(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json({
    audit: audit.stats(),
    servers: config.upstreams.map((u) => u.id),
    keyLabels: config.apiKeys.map((k) => k.label),
  });
});

/**
 * Streamable HTTP-style MCP endpoint (JSON-RPC over POST).
 * Clients: Claude Desktop remote MCP, Cursor, custom agents.
 */
app.post("/v1/mcp/:serverId", async (c) => {
  const started = Date.now();
  const serverId = c.req.param("serverId");
  const ip = clientIp(c);

  const upstream = findUpstream(config, serverId);
  if (!upstream) {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: `Unknown server: ${serverId}` },
      },
      404,
    );
  }

  let keyLabel = "anonymous";
  let rpm = config.defaultRpm;

  if (config.requireAuth) {
    const token = bearer(c.req.header("authorization"));
    if (!token) {
      audit.push({
        keyLabel: "none",
        serverId,
        method: "(auth)",
        status: 401,
        durationMs: Date.now() - started,
        error: "missing_bearer",
        clientIp: ip,
      });
      return c.json({ error: "missing_bearer", hint: "Authorization: Bearer <api-key>" }, 401);
    }
    const rec = findKey(config, token);
    if (!rec) {
      audit.push({
        keyLabel: "invalid",
        serverId,
        method: "(auth)",
        status: 401,
        durationMs: Date.now() - started,
        error: "invalid_key",
        clientIp: ip,
      });
      return c.json({ error: "invalid_key" }, 401);
    }
    if (rec.servers.length > 0 && !rec.servers.includes(serverId)) {
      audit.push({
        keyLabel: rec.label,
        serverId,
        method: "(auth)",
        status: 403,
        durationMs: Date.now() - started,
        error: "server_forbidden",
        clientIp: ip,
      });
      return c.json({ error: "server_forbidden", serverId }, 403);
    }
    keyLabel = rec.label;
    rpm = rec.rpm;

    const rl = limiter.check(`${rec.key}:${serverId}`, rpm);
    c.header("X-RateLimit-Limit", String(rl.limit));
    c.header("X-RateLimit-Remaining", String(rl.remaining));
    if (!rl.allowed) {
      audit.push({
        keyLabel,
        serverId,
        method: "(ratelimit)",
        status: 429,
        durationMs: Date.now() - started,
        error: "rate_limited",
        clientIp: ip,
      });
      c.header("Retry-After", String(Math.ceil(rl.resetMs / 1000)));
      return c.json({ error: "rate_limited", retryAfterMs: rl.resetMs }, 429);
    }
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = (await c.req.json()) as JsonRpcRequest;
  } catch {
    audit.push({
      keyLabel,
      serverId,
      method: "(parse)",
      status: 400,
      durationMs: Date.now() - started,
      error: "invalid_json",
      clientIp: ip,
    });
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      400,
    );
  }

  const method = rpc.method ?? "(empty)";
  const toolName = extractToolName(rpc);

  try {
    const result = await dispatchMcp(upstream, rpc);
    audit.push({
      keyLabel,
      serverId,
      method,
      toolName,
      status: result.status,
      durationMs: Date.now() - started,
      error: result.status >= 400 ? "upstream_error" : undefined,
      clientIp: ip,
    });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    audit.push({
      keyLabel,
      serverId,
      method,
      toolName,
      status: 502,
      durationMs: Date.now() - started,
      error: message,
      clientIp: ip,
    });
    return c.json(
      {
        jsonrpc: "2.0",
        id: rpc.id ?? null,
        error: { code: -32002, message: `Upstream failure: ${message}` },
      },
      502,
    );
  }
});
