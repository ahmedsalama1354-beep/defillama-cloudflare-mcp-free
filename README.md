# DeFiLlama MCP for Cloudflare Workers (free API)

This is a Cloudflare Workers JavaScript project, not the previous Python/Render project. It exposes a stateless Streamable HTTP MCP endpoint at `/mcp` and a health endpoint at `/health`.

## Deploy through Cloudflare dashboard
1. Upload these files to a GitHub repository: `package.json`, `wrangler.jsonc`, `src/index.js`, and this README.
2. In Cloudflare dashboard, open Workers & Pages → Create → Workers → Import a repository (or connect the repository to Workers & Pages).
3. Select the repository and deploy. The project is configured with `src/index.js` as its entry point and needs no build step.
4. The service will receive a `https://<worker-name>.<account-subdomain>.workers.dev` URL.
5. Open `/health` to confirm it responds. MCP endpoint is `/mcp`.

## Test MCP protocol
Use an MCP client such as MCP Inspector. Enter the URL ending in `/mcp`, choose Streamable HTTP, connect, list tools, and call `get_protocol_tvl` with `{"protocol":"aave"}`.

You can also smoke-test the deployed server with curl (replace URL):

```bash
curl -sS https://YOUR-WORKER.workers.dev/health
curl -sS https://YOUR-WORKER.workers.dev/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-smoke-test","version":"1.0"}}}'
curl -sS https://YOUR-WORKER.workers.dev/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_protocol_tvl","arguments":{"protocol":"aave"}}}'
```

## Tools
- `search_protocols(query, limit=10)`
- `get_protocol_tvl(protocol)`
- `get_protocol_fees_revenue(protocol)`
- `get_dex_volume(protocol)`
- `get_chain_tvl(limit=15)`

No API key is used. The server is read-only and accepts only internally defined paths on `https://api.llama.fi`; do not add credentials or trading tools. Fee/revenue coverage varies by protocol. Cloudflare Workers free plan has usage limits, and MCP availability in ChatGPT depends on the user's ChatGPT plan and workspace settings.
