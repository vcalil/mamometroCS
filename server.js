// Servidor local (usado no Docker e via `npm run start`).
// Serve o site já buildado (dist/) e responde à mesma Netlify Function do
// Steam — reaproveitando exatamente o handler de produção, sem duplicar lógica.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { handler as steamProfile } from "./netlify/functions/steam-profile.js";
import { handler as gsi } from "./netlify/functions/gsi.js";

const DIST = path.resolve("dist");
const PORT = process.env.PORT || 8888;
const FUNCS = { "steam-profile": steamProfile, gsi };

function lerCorpo(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function seguro(base, alvo) {
  // Impede path traversal (../) para fora de dist/.
  const resolvido = path.resolve(base, "." + alvo);
  return resolvido.startsWith(base) ? resolvido : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ---- Rotas das Netlify Functions ----
  const mFunc = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
  if (mFunc && FUNCS[mFunc[1]]) {
    try {
      const body = req.method === "POST" ? await lerCorpo(req) : undefined;
      const result = await FUNCS[mFunc[1]]({
        httpMethod: req.method,
        queryStringParameters: Object.fromEntries(url.searchParams),
        body,
      });
      res.writeHead(result.statusCode, result.headers || {});
      res.end(result.body);
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.message || "Erro interno." }));
    }
    return;
  }

  // ---- Arquivos estáticos (com fallback pro index.html) ----
  let file = seguro(DIST, url.pathname === "/" ? "/index.html" : url.pathname);
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    file = path.join(DIST, "index.html");
  }
  try {
    const buf = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Não encontrado. Rode `npm run build` antes de `npm run start`.");
  }
});

server.listen(PORT, () => {
  console.log(`Mamômetro rodando em http://localhost:${PORT}`);
  if (!process.env.STEAM_API_KEY) {
    console.log("⚠  STEAM_API_KEY não definida — o botão 'Buscar da Steam' vai avisar.");
  }
});
