// Servidor self-hosted (entry point do Docker e do `npm run start`).
// Serve o site já buildado (dist/) e responde às funções em /api/* (steam-profile,
// gsi, onboard) reaproveitando os mesmos handlers de netlify/functions/, sem
// duplicar lógica. É o único caminho de deploy (Netlify foi descontinuado).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { handler as steamProfile } from "./netlify/functions/steam-profile.js";
import { handler as gsi } from "./netlify/functions/gsi.js";
import { handler as onboard } from "./netlify/functions/onboard.js";

const DIST = path.resolve("dist");
const PORT = process.env.PORT || 8888;
// As funções são servidas em /api/:name (padrão self-hosted, entry point único
// do Docker). O caminho /.netlify/functions/:name segue como alias LEGADO —
// compat com URLs antigas e com o .cfg do GSI já instalado no CS2 da galera,
// até a migração de domínio concluir. Mesmos handlers nos dois caminhos.
const HANDLERS = { "steam-profile": steamProfile, gsi, onboard };

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

// Config web do Firebase montada a partir das envs VITE_FIREBASE_* (as mesmas
// que o Vite injeta no SPA no build). A chave web é pública por design, mas
// não fica chumbada no código-fonte — páginas standalone (public/onboard.html)
// recebem via este <script> injetado no serve. O `<` é escapado pra não
// permitir quebrar o contexto do <script>.
function firebaseConfigScript() {
  const cfg = {
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  };
  const json = JSON.stringify(cfg).replace(/</g, "\\u003c");
  return `<script>window.__FIREBASE_CONFIG__=${json};</script>`;
}

async function chamarHandler(handler, req, url) {
  const body = req.method === "POST" ? await lerCorpo(req) : undefined;
  const result = await handler({
    httpMethod: req.method,
    queryStringParameters: Object.fromEntries(url.searchParams),
    body,
  });
  return {
    status: result.statusCode,
    headers: result.headers || {},
    body: result.body,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ---- API: /api/:name (padrão) + /.netlify/functions/:name (alias legado) ----
  const mApi =
    url.pathname.match(/^\/api\/([\w-]+)\/?$/) ||
    url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/);
  if (mApi && HANDLERS[mApi[1]]) {
    try {
      const { status, headers, body } = await chamarHandler(HANDLERS[mApi[1]], req, url);
      res.writeHead(status, headers);
      res.end(body);
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
    const ext = path.extname(file).toLowerCase();
    let buf = await readFile(file);
    // Injeta a config do Firebase nas páginas standalone que trazem o marcador
    // (ex.: onboard.html) — a chave não fica chumbada no repo.
    if (ext === ".html") {
      const html = buf.toString("utf-8");
      if (html.includes("<!--FIREBASE_CONFIG_INJECT-->")) {
        buf = Buffer.from(
          html.replace("<!--FIREBASE_CONFIG_INJECT-->", firebaseConfigScript()),
          "utf-8"
        );
      }
    }
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
