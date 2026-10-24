import type { ApiKeyRecord, UpstreamServer } from "./types.js";

export function env(name: string, fallback = ""): string {
  if (typeof process === "undefined") return fallback;
  return process.env?.[name] ?? fallback;
}

/**
 * API keys from env.
 * Format: `label:token:rpm[:server1|server2],...`
 * Or simple tokens: `token1,token2` (default rpm, label=token prefix)
 */
export function parseApiKeys(raw?: string): ApiKeyRecord[] {
  const src = raw ?? env("MCPGATE_API_KEYS", "demo:dev-mcp-key:120");
  if (!src.trim()) return [];
  return src.split(",").map((part, i) => {
    const bits = part.trim().split(":");
    if (bits.length === 1) {
      const key = bits[0]!;
      return {
        key,
        label: `key${i + 1}`,
        rpm: Number(env("MCPGATE_DEFAULT_RPM", "60")) || 60,
        servers: [],
      };
    }
    if (bits.length === 2) {
      // label:token OR token:rpm
      const maybeRpm = Number(bits[1]);
      if (Number.isFinite(maybeRpm) && bits[1] !== "") {
        return {
          key: bits[0]!,
          label: `key${i + 1}`,
          rpm: maybeRpm,
          servers: [],
        };
      }
      return {
        key: bits[1]!,
        label: bits[0]!,
        rpm: Number(env("MCPGATE_DEFAULT_RPM", "60")) || 60,
        servers: [],
      };
    }
    // label:token:rpm[:servers]
    const label = bits[0]!;
    const key = bits[1]!;
    const rpm = Number(bits[2]) || 60;
    const servers =
      bits[3]
        ?.split("|")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    return { key, label, rpm, servers };
  });
}

/**
 * Upstreams: `id:builtin,other:https://host/mcp`
 */
export function parseUpstreams(raw?: string): UpstreamServer[] {
  const src =
    raw ??
    env(
      "MCPGATE_UPSTREAMS",
      "demo:builtin,echo:builtin",
    );
  if (!src.trim()) {
    return [{ id: "demo", kind: "builtin", description: "Built-in demo tools" }];
  }
  return src.split(",").map((part) => {
    const [id, target, ...rest] = part.trim().split(":");
    if (!id) throw new Error("invalid upstream id");
    const joined = [target, ...rest].join(":");
    if (!joined || joined === "builtin") {
      return {
        id,
        kind: "builtin" as const,
        description: "Built-in MCP tools",
      };
    }
    return {
      id,
      kind: "http" as const,
      url: joined,
      description: `Proxy → ${joined}`,
    };
  });
}

export function loadConfig() {
  return {
    adminToken: env("MCPGATE_ADMIN_TOKEN", "dev-admin-token"),
    apiKeys: parseApiKeys(),
    upstreams: parseUpstreams(),
    defaultRpm: Number(env("MCPGATE_DEFAULT_RPM", "60")) || 60,
    auditMax: Number(env("MCPGATE_AUDIT_MAX", "500")) || 500,
    requireAuth: env("MCPGATE_REQUIRE_AUTH", "true") !== "false",
    rateLimitWindowMs: Number(env("MCPGATE_RATE_WINDOW_MS", "60000")) || 60_000,
  };
}

export type GateConfig = ReturnType<typeof loadConfig>;

export function findUpstream(
  config: GateConfig,
  serverId: string,
): UpstreamServer | undefined {
  return config.upstreams.find((u) => u.id === serverId);
}

export function findKey(
  config: GateConfig,
  token: string,
): ApiKeyRecord | undefined {
  return config.apiKeys.find((k) => k.key === token);
}
