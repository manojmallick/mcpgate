import { describe, expect, it } from "vitest";
import { parseApiKeys, parseUpstreams } from "./config.js";
import { RateLimiter } from "./ratelimit.js";
import { handleBuiltinMcp } from "./builtin-mcp.js";

describe("parseApiKeys", () => {
  it("parses label:token:rpm", () => {
    const keys = parseApiKeys("prod:secret1:30,dev:secret2:120");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatchObject({
      label: "prod",
      key: "secret1",
      rpm: 30,
    });
  });

  it("parses server allow-list", () => {
    const keys = parseApiKeys("bot:tok:60:demo|ha");
    expect(keys[0]!.servers).toEqual(["demo", "ha"]);
  });
});

describe("parseUpstreams", () => {
  it("parses builtin and http", () => {
    const u = parseUpstreams("demo:builtin,remote:https://example.com/mcp");
    expect(u[0]).toEqual({
      id: "demo",
      kind: "builtin",
      description: "Built-in MCP tools",
    });
    expect(u[1]!.kind).toBe("http");
    expect(u[1]!.url).toBe("https://example.com/mcp");
  });
});

describe("RateLimiter", () => {
  it("allows up to limit then blocks", () => {
    const rl = new RateLimiter(60_000);
    expect(rl.check("a", 2).allowed).toBe(true);
    expect(rl.check("a", 2).allowed).toBe(true);
    expect(rl.check("a", 2).allowed).toBe(false);
  });
});

describe("builtin MCP", () => {
  it("lists tools", () => {
    const res = handleBuiltinMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.result).toBeDefined();
    const tools = (res.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name)).toContain("mcpgate_echo");
  });

  it("echoes", () => {
    const res = handleBuiltinMcp({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "mcpgate_echo", arguments: { message: "hi" } },
    });
    const content = (res.result as { content: { text: string }[] }).content;
    expect(content[0]!.text).toBe("hi");
  });
});
