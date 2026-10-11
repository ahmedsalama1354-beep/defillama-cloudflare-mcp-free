const API = "https://api.llama.fi";
const PROTOCOL = "2025-03-26";

const tools = [
  {
    name: "search_protocols",
    description: "Search DeFiLlama protocols by name, symbol, category, or chain. Returns compact results.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search phrase, e.g. aave or lending" },
        limit: { type: "integer", minimum: 1, maximum: 20, default: 10 }
      },
      required: ["query"], additionalProperties: false
    }
  },
  {
    name: "get_protocol_tvl",
    description: "Get current TVL and a short historical TVL series for a DeFiLlama protocol slug, e.g. aave or uniswap.",
    inputSchema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"], additionalProperties: false }
  },
  {
    name: "get_protocol_fees_revenue",
    description: "Get public DeFiLlama fees and revenue summary when reported for a protocol slug.",
    inputSchema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"], additionalProperties: false }
  },
  {
    name: "get_dex_volume",
    description: "Get public DeFiLlama DEX volume summary for a protocol slug, e.g. uniswap.",
    inputSchema: { type: "object", properties: { protocol: { type: "string" } }, required: ["protocol"], additionalProperties: false }
  },
  {
    name: "get_chain_tvl",
    description: "Get the largest blockchain networks ranked by current TVL.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30, default: 15 } }, additionalProperties: false }
  }
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(), ...extraHeaders } });
}
function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, accept, mcp-session-id, mcp-protocol-version",
    "access-control-expose-headers": "mcp-session-id"
  };
}
function err(id, code, message) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }
async function getJson(path) {
  const response = await fetch(API + path, { headers: { accept: "application/json", "user-agent": "defillama-cloudflare-mcp/1.0" } });
  if (!response.ok) throw new Error(`DeFiLlama API returned HTTP ${response.status} for ${path}`);
  return await response.json();
}
function validSlug(value) {
  const slug = String(value ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(slug) || slug.includes("..")) throw new Error("Provide a valid protocol slug, e.g. aave or uniswap.");
  return slug;
}
function num(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }

async function callTool(name, args = {}) {
  if (name === "search_protocols") {
    const query = String(args.query ?? "").trim().toLowerCase();
    if (!query) throw new Error("query must not be empty");
    const limit = Math.max(1, Math.min(Number(args.limit) || 10, 20));
    const data = await getJson("/protocols");
    const results = [];
    for (const p of data) {
      const searchable = [p.name, p.symbol, p.category, ...(p.chains || [])].filter(Boolean).join(" ").toLowerCase();
      if (searchable.includes(query)) {
        results.push({ name: p.name, slug: p.slug, symbol: p.symbol, category: p.category,
          chains: (p.chains || []).slice(0, 10), tvl_usd: num(p.tvl),
          change_1d_pct: num(p.change_1d), change_7d_pct: num(p.change_7d), url: p.url });
        if (results.length >= limit) break;
      }
    }
    return { query: args.query, count: results.length, results, source: `${API}/protocols` };
  }
  if (name === "get_protocol_tvl") {
    const slug = validSlug(args.protocol);
    const [current, details] = await Promise.all([getJson(`/tvl/${encodeURIComponent(slug)}`), getJson(`/protocol/${encodeURIComponent(slug)}`)]);
    const history = Array.isArray(details?.tvl) ? details.tvl.slice(-8).map(x => ({ date: x.date, tvl_usd: x.totalLiquidityUSD })) : [];
    const chainTVLs = details?.currentChainTvls && typeof details.currentChainTvls === "object" ? Object.entries(details.currentChainTvls).filter(([,v]) => typeof v === "number").sort((a,b)=>b[1]-a[1]).slice(0,12).map(([chain,tvl_usd])=>({chain,tvl_usd})) : [];
    return { protocol: details?.name || slug, slug, current_tvl_usd: num(current), chains: chainTVLs, recent_tvl_history: history, source_current: `${API}/tvl/${slug}`, source_history: `${API}/protocol/${slug}` };
  }
  if (name === "get_protocol_fees_revenue") {
    const slug = validSlug(args.protocol);
    const data = await getJson(`/summary/fees/${encodeURIComponent(slug)}`);
    const keys = ["name","displayName","category","chains","total24h","total48hto24h","total7d","total30d","total1y","totalAllTime","totalDataChart","totalDataChartBreakdown","dailyRevenue","dailyUserFees","dailySupplySideRevenue","revenue24h","revenue7d","revenue30d","revenue1y","revenueAllTime","methodology","url"];
    const out = {};
    for (const k of keys) if (k in (data || {})) out[k] = data[k];
    for (const k of ["totalDataChart", "totalDataChartBreakdown"]) if (Array.isArray(out[k])) out[k] = out[k].slice(-8);
    out.slug = slug; out.source = `${API}/summary/fees/${slug}`;
    out.note = "Fees are paid by users; revenue is the portion retained by the protocol where reported. Missing fields do not mean zero.";
    return out;
  }
  if (name === "get_dex_volume") {
    const slug = validSlug(args.protocol);
    const data = await getJson(`/summary/dexs/${encodeURIComponent(slug)}`);
    const keys = ["name","displayName","category","chains","total24h","total48hto24h","total7d","total30d","total1y","totalAllTime","totalDataChart","totalDataChartBreakdown","methodology","url"];
    const out = {};
    for (const k of keys) if (k in (data || {})) out[k] = data[k];
    for (const k of ["totalDataChart", "totalDataChartBreakdown"]) if (Array.isArray(out[k])) out[k] = out[k].slice(-8);
    out.slug = slug; out.source = `${API}/summary/dexs/${slug}`;
    return out;
  }
  if (name === "get_chain_tvl") {
    const limit = Math.max(1, Math.min(Number(args.limit) || 15, 30));
    const data = await getJson("/v2/chains");
    const chains = data.map(c => ({ chain: c.name, tvl_usd: num(c.tvl), token_symbol: c.tokenSymbol, chain_id: c.chainId }))
      .sort((a,b)=>(b.tvl_usd || 0)-(a.tvl_usd || 0)).slice(0, limit);
    return { count_returned: chains.length, chains, source: `${API}/v2/chains` };
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRpc(body) {
  const id = body?.id;
  if (body?.jsonrpc !== "2.0" || typeof body?.method !== "string") return err(id, -32600, "Invalid JSON-RPC request");
  if (body.method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "defillama-free-mcp", version: "1.0.0" }, instructions: "Read-only tools using DeFiLlama public API endpoints. No API key is used. Missing fee/revenue fields are not zero." } };
  }
  if (body.method === "notifications/initialized" || body.method.startsWith("notifications/")) return null;
  if (body.method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (body.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools } };
  if (body.method === "tools/call") {
    const name = body.params?.name;
    try {
      const result = await callTool(name, body.params?.arguments || {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false } };
    } catch (e) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(e?.message || e) }], isError: true } };
    }
  }
  if (body.method === "resources/list") return { jsonrpc: "2.0", id, result: { resources: [] } };
  return err(id, -32601, `Method not found: ${body.method}`);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, service: "defillama-free-mcp", endpoint: "/mcp", tools: tools.map(t => t.name) });
    if (url.pathname !== "/mcp") return json({ error: "Not found", endpoint: "/mcp" }, 404);
    if (request.method === "GET") return new Response("DeFiLlama MCP endpoint. Use an MCP client with Streamable HTTP; browser GET is not the MCP handshake.", { status: 405, headers: { "content-type": "text/plain; charset=utf-8", allow: "POST, OPTIONS", ...corsHeaders() } });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST, OPTIONS", ...corsHeaders() } });
    let body;
    try { body = await request.json(); } catch { return json(err(null, -32700, "Parse error"), 400); }
    const result = await handleRpc(body);
    if (result === null) return new Response(null, { status: 202, headers: corsHeaders() });
    return json(result, 200, { "mcp-protocol-version": PROTOCOL });
  }
};
