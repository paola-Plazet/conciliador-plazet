// Sondeo del servidor MCP de Karrot (el mismo que usa el conector de Claude):
// saludo del protocolo (initialize), lista de herramientas y, si se pide, un
// reporte chico. Lee KARROT_MCP_URL y KARROT_API_KEY de .env.
//   npx tsx scripts/karrot-mcp-probe.ts [reportType startDate endDate]
import fs from "node:fs";

const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const BASE = (env.KARROT_MCP_URL ?? "").replace(/\/$/, "");
const KEY = env.KARROT_API_KEY ?? "";
if (!BASE || !KEY) { console.log("Faltan KARROT_MCP_URL / KARROT_API_KEY en .env"); process.exit(1); }

let sessionId: string | null = null;
let nextId = 1;

async function rpc(path: string, method: string, params: unknown, headersExtra: Record<string, string> = {}) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${KEY}`,
    "x-api-key": KEY,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    ...headersExtra,
  };
  const res = await fetch(BASE + path, { method: "POST", headers, body });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  // Streamable HTTP puede responder SSE: tomar el último "data:" con JSON
  let json: unknown = null;
  if (ct.includes("text/event-stream")) {
    const datas = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
    for (const d of datas) { try { json = JSON.parse(d); } catch { /* ignorar */ } }
  } else {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, ct, sid, json, raw: text.slice(0, 600) };
}

async function main() {
  const [reportType, startDate, endDate] = process.argv.slice(2);
  for (const path of ["", "/mcp", "/sse", "/messages"]) {
    sessionId = null;
    const r = await rpc(path, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "conciliador-plazet", version: "1.0" },
    });
    console.log(`\nPOST ${path || "/"} initialize → ${r.status} ${r.ct} session=${r.sid ?? "-"}`);
    console.log("   ", r.json ? JSON.stringify(r.json).slice(0, 400) : r.raw);
    if (r.status >= 200 && r.status < 300 && r.json) {
      await rpc(path, "notifications/initialized", {}).catch(() => {});
      const tools = await rpc(path, "tools/list", {});
      const list = (tools.json as any)?.result?.tools ?? [];
      console.log("   tools:", list.map((t: any) => t.name).join(", ") || tools.raw);
      if (reportType) {
        const call = await rpc(path, "tools/call", { name: "generate-report", arguments: { reportType, startDate, endDate } });
        console.log("   call →", call.status, JSON.stringify(call.json).slice(0, 1200));
      }
      break;
    }
  }
}
main();
