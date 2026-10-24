# MCPGate logic

| File | Role |
|------|------|
| `config.ts` | Env parse: API keys, upstreams, admin token |
| `ratelimit.ts` | Sliding-window RPM limiter |
| `audit.ts` | Ring-buffer request audit log |
| `builtin-mcp.ts` | In-process demo MCP (JSON-RPC tools) |
| `proxy.ts` | Builtin vs HTTP upstream dispatch |
| `app.ts` | Hono routes (all cloud targets) |

Env:

```bash
MCPGATE_API_KEYS=demo:dev-mcp-key:120
MCPGATE_ADMIN_TOKEN=dev-admin-token
MCPGATE_UPSTREAMS=demo:builtin,myagent:https://host/mcp
MCPGATE_REQUIRE_AUTH=true
```
