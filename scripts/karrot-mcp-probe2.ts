// Variantes de autenticación contra el servidor MCP de Karrot (401 con Bearer / x-api-key).
import fs from "node:fs";
const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}
const BASE = env.KARROT_MCP_URL.replace(/\/$/, "");
const KEY = env.KARROT_API_KEY;
const init = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "conciliador", version: "1" } } });

async function main() {
  const g = await fetch(BASE + "/", { headers: { Accept: "*/*" } });
  console.log("GET / →", g.status, g.headers.get("content-type"), (await g.text()).slice(0, 300).replace(/\s+/g, " "));
  const g2 = await fetch(BASE + "/mcp", { headers: { Accept: "text/event-stream", Authorization: `Bearer ${KEY}` } });
  console.log("GET /mcp (Bearer) →", g2.status, g2.headers.get("content-type"), (await g2.text()).slice(0, 200).replace(/\s+/g, " "));

  const variantes: [string, Record<string, string>, string][] = [
    ["Authorization: <key>", { Authorization: KEY }, ""],
    ["Authorization: Token", { Authorization: `Token ${KEY}` }, ""],
    ["Authorization: ApiKey", { Authorization: `ApiKey ${KEY}` }, ""],
    ["Authorization: Basic key:", { Authorization: "Basic " + Buffer.from(KEY + ":").toString("base64") }, ""],
    ["api-key", { "api-key": KEY }, ""],
    ["apikey", { apikey: KEY }, ""],
    ["x-karrot-api-key", { "x-karrot-api-key": KEY }, ""],
    ["x-auth-token", { "x-auth-token": KEY }, ""],
    ["token", { token: KEY }, ""],
    ["?apiKey=", {}, `?apiKey=${encodeURIComponent(KEY)}`],
    ["?token=", {}, `?token=${encodeURIComponent(KEY)}`],
    ["?key=", {}, `?key=${encodeURIComponent(KEY)}`],
  ];
  for (const path of ["/mcp", "/"]) {
    for (const [nombre, h, q] of variantes) {
      const res = await fetch(BASE + path + q, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...h },
        body: init,
      });
      const t = (await res.text()).slice(0, 160).replace(/\s+/g, " ");
      console.log(`POST ${path} ${nombre.padEnd(26)} → ${res.status} ${t}`);
      if (res.status !== 401 && res.status !== 403) break;
    }
  }
}
main();
