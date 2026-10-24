# MCPGate

MCPGate is a prototype gateway for routing HTTP MCP requests through bearer authentication, per-key rate limits, and an audit log. It includes a built-in demo server and adapters for Cloudflare Workers, AWS Lambda, and Google Cloud Run.

## Run locally

Requirements: Node.js and pnpm.

```bash
pnpm install
pnpm dev
```

The service listens on port `8080` by default. See `.env.example` for local development settings. Its example tokens are public placeholders and must never be used outside local development.

## Example request

```bash
curl -X POST http://localhost:8080/v1/mcp/demo \
  -H 'Authorization: Bearer dev-mcp-key' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Configuration

| Variable | Purpose |
|---|---|
| `MCPGATE_API_KEYS` | API keys and optional rate/target limits |
| `MCPGATE_ADMIN_TOKEN` | Protects audit and stats endpoints |
| `MCPGATE_UPSTREAMS` | Maps server IDs to built-in or remote MCP servers |
| `MCPGATE_REQUIRE_AUTH` | Enables API-key enforcement |
| `MCPGATE_DEFAULT_RPM` | Default per-key request limit |
| `PORT` | HTTP listen port |

## Build and deploy

```bash
pnpm typecheck
pnpm test
pnpm build
```

Cloud deployment workflows require explicit manual dispatch and correctly configured secrets. Review each workflow and configure cloud permissions before using it.

## Security limitations

This is a prototype. Rate limits and audit state are in-memory or local to an instance, so they do not coordinate across multiple instances. Use TLS, strong unique secrets, and an appropriate persistent/shared store before any production deployment. Review the implementation and deployment settings for your environment.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). This source-available license restricts commercial use; it is not an OSI-approved open-source license. See the license for terms and exceptions. Third-party dependencies retain their own licenses.
