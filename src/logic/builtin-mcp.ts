/**
 * Minimal in-process MCP (JSON-RPC) server for demos and smoke tests.
 * Real deployments proxy to your own MCP HTTP endpoint via MCPGATE_UPSTREAMS.
 */

import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

const SERVER_INFO = {
  name: "mcpgate-builtin",
  version: "0.1.0",
};

const TOOLS = [
  {
    name: "mcpgate_ping",
    description: "Health check tool — returns pong + server time",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "mcpgate_echo",
    description: "Echo back a message (demo tool)",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "mcpgate_time",
    description: "Current ISO timestamp from the gateway host",
    inputSchema: {
      type: "object",
      properties: {
        timezone_hint: { type: "string", description: "Ignored; informational" },
      },
    },
  },
] as const;

function ok(id: string | number | null | undefined, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function handleBuiltinMcp(req: JsonRpcRequest): JsonRpcResponse {
  const id = req.id ?? null;
  const method = req.method ?? "";

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
      });

    case "notifications/initialized":
    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const params = req.params ?? {};
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      if (name === "mcpgate_ping") {
        return ok(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                pong: true,
                at: new Date().toISOString(),
                via: "mcpgate-builtin",
              }),
            },
          ],
        });
      }
      if (name === "mcpgate_echo") {
        return ok(id, {
          content: [
            {
              type: "text",
              text: String(args.message ?? ""),
            },
          ],
        });
      }
      if (name === "mcpgate_time") {
        return ok(id, {
          content: [
            {
              type: "text",
              text: new Date().toISOString(),
            },
          ],
        });
      }
      return err(id, -32601, `Unknown tool: ${name}`);
    }

    case "resources/list":
      return ok(id, { resources: [] });

    case "prompts/list":
      return ok(id, { prompts: [] });

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

export function extractToolName(req: JsonRpcRequest): string | undefined {
  if (req.method === "tools/call" && req.params && typeof req.params.name === "string") {
    return req.params.name;
  }
  return undefined;
}
