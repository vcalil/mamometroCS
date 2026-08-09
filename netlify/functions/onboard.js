// Netlify Function: F1 Fase 3 — onboard self-serve.
//
// Recebe {steamId OR profileUrl, authCode, shareCode}, valida via
// GetNextMatchSharingCode da Steam Web API e grava em roster/{steamId}
// no RTDB. Sem login (handoff §5: "jogador cola perfil + 2 codes,
// valida via Steam Web API, grava em roster/").
//
// O nome do jogador vem do GetPlayerSummaries (reuso do mesmo pattern do
// steam-profile.js). A validacao dos codes usa o endpoint
// ICSGOPlayers_730/GetNextMatchingShareCode, que devolve 403 se o
// authCode estiver expirado/errado, 200 com o proximo code se estiver
// certo.
//
// Erros:
//   400 — input malformado, codes invalidos
//   404 — perfil nao encontrado (vanity sem match)
//   500 — STEAM_API_KEY / FIREBASE_SA_PATH / FIREBASE_DATABASE_URL faltando
//   502 — Steam Web API indisponivel / timeout
//   503 — Firebase indisponivel

import admin from "firebase-admin";
import { existsSync, readFileSync } from "node:fs";

const STEAM = "https://api.steampowered.com";

// ---- response helper --------------------------------------------------------

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

function erro(statusCode, code, message) {
  return json(statusCode, { ok: false, error: code, message });
}

// ---- input validation -------------------------------------------------------

// AAAA-1111-BBBB (4 ou 5 chars alfanumericos por grupo, separados por hifen).
// Mixed case aceito (CS2 pode gerar com qualquer caixa).
const AUTH_CODE_RE = /^[A-Za-z0-9]{4,5}-[A-Za-z0-9]{4,5}-[A-Za-z0-9]{4,5}$/;
// CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (5 grupos de 5 alfanumericos, prefixo CSGO-).
// IMPORTANTE: Steam gera com mixed case (ex. "CSGO-p8QNB-TUzXw-WA8oh-6sDxR-E8V5F")
// e a API GetNextMatchSharingCode e CASE-SENSITIVE no match. Se o cliente upper-
// casear antes de enviar, o codigo nao bate e a Steam devolve 412.
const SHARE_CODE_RE = /^CSGO-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/;
const STEAM_ID_RE = /^\d{17}$/;

function parseInput(body) {
  let raw;
  try {
    raw = JSON.parse(body || "{}");
  } catch {
    return { error: "JSON malformado no body." };
  }
  // IMPORTANTE: NÃO fazer toUpperCase. Steam gera share codes com mixed case
  // (ex. "CSGO-p8QNB-TUzXw-WA8oh-6sDxR-E8V5F") e o endpoint
  // GetNextMatchSharingCode é case-sensitive — uppercasing quebra o match e a
  // Steam devolve 412.
  const authCode = String(raw.authCode || "").trim();
  const shareCode = String(raw.shareCode || "").trim();
  const steamIdRaw = String(raw.steamId || "").trim();
  const profileUrl = String(raw.profileUrl || "").trim();

  if (!AUTH_CODE_RE.test(authCode)) {
    return { error: "authCode invalido. Esperado AAAA-1111-BBBB." };
  }
  if (!SHARE_CODE_RE.test(shareCode)) {
    return { error: "shareCode invalido. Esperado CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX." };
  }
  if (!steamIdRaw && !profileUrl) {
    return { error: "Informe steamId (17 digitos) ou profileUrl." };
  }
  if (steamIdRaw && !STEAM_ID_RE.test(steamIdRaw)) {
    return { error: "steamId invalido. Esperado 17 digitos." };
  }
  return { authCode, shareCode, steamId: steamIdRaw, profileUrl };
}

// ---- Steam: resolve vanity URL -> steamId64 ---------------------------------

async function resolverVanity(vanity, key) {
  const url = `${STEAM}/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanity)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const e = new Error(`Steam respondeu ${r.status} ao resolver o vanity URL.`);
    e.statusCode = 502;
    e.code = "steam_upstream_error";
    throw e;
  }
  const data = await r.json();
  if (!data.response || data.response.success !== 1 || !data.response.steamid) {
    const e = new Error("Perfil nao encontrado. Confira a URL ou o ID.");
    e.statusCode = 404;
    e.code = "profile_not_found";
    throw e;
  }
  return data.response.steamid;
}

// ---- Steam: GetNextMatchSharingCode (valida os 2 codes juntos) --------------
//
// O endpoint devolve 200 + JSON { result: { nextcode: "..." } } se o par
// (steamidkey=authCode, knowncode=shareCode) for valido para aquele steamid.
// Devolve 403 se o authCode estiver expirado/errado, e nesse caso a Steam
// NAO distingue "expirado" de "errado" — so "code invalido". Por isso o
// erro retornado ao cliente e unico.

async function validarCodes(steamId, authCode, shareCode, key) {
  const url = `${STEAM}/ICSGOPlayers_730/GetNextMatchSharingCode/v1?key=${key}&steamid=${steamId}&steamidkey=${encodeURIComponent(authCode)}&knowncode=${encodeURIComponent(shareCode)}`;
  // DEBUG: log de tudo que vai pra Steam (mascarado, sem a key)
  console.log(`[onboard] validarCodes: steamid=${steamId} authCode=${authCode} shareCode=${shareCode} urlSteam=${STEAM}/ICSGOPlayers_730/GetNextMatchSharingCode/v1?steamid=${steamId}&steamidkey=${encodeURIComponent(authCode)}&knowncode=${encodeURIComponent(shareCode)}`);
  const r = await fetch(url);
  if (r.status === 403) {
    const e = new Error("authCode invalido ou expirado. Gera um novo no wizard da Valve.");
    e.statusCode = 400;
    e.code = "auth_code_invalid";
    throw e;
  }
  if (r.status === 412) {
    // "knowncode parameter is invalid or does not represent a match sharing code
    // that belongs to the user" (Steam official quote). Quase sempre: share code
    // de outra pessoa, de FACEIT, ou revogado.
    let steamBody = "";
    try { steamBody = await r.text(); } catch {}
    const e = new Error(`Share code nao bate com a conta Steam (412). Steam body: ${steamBody.slice(0, 200) || "(vazio)"}. Confere se o share code e dessa mesma conta e de uma partida de Valve Matchmaking.`);
    e.statusCode = 400;
    e.code = "share_code_invalid";
    throw e;
  }
  if (!r.ok) {
    const e = new Error(`Steam respondeu ${r.status} ao validar os codes.`);
    e.statusCode = 502;
    throw e;
  }
  const data = await r.json();
  // Resposta tipica com codes validos: { result: { nextcode: "CSGO-..." } }
  // Resposta com codes invalidos: 403 (tratado acima)
  if (!data || !data.result) {
    const e = new Error("Resposta inesperada da Steam.");
    e.statusCode = 502;
    throw e;
  }
  return data.result;
}

// ---- Steam: GetPlayerSummaries (busca o nome) -------------------------------

async function buscarNome(steamId, key) {
  const url = `${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
  const r = await fetch(url);
  if (!r.ok) return null; // nome e nice-to-have, nao bloqueia o onboard
  const data = await r.json();
  const p = data.response && data.response.players && data.response.players[0];
  return p ? p.personaname || "" : null;
}

// ---- Firebase Admin SDK (lazy init) -----------------------------------------

let _app = null;
function initFirebase() {
  if (_app) return _app;
  const saPath = process.env.FIREBASE_SA_PATH;
  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  if (!saPath || !dbUrl) return null;
  if (!existsSync(saPath)) {
    throw new Error(`FIREBASE_SA_PATH nao existe: ${saPath}`);
  }
  const sa = JSON.parse(readFileSync(saPath, "utf-8"));
  _app = admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: dbUrl,
  });
  return _app;
}

// ---- estado/players (ranking) -------------------------------------------------

// Mesmo formato de id do SPA (state.js uid): Date.now().toString(36) + random.
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Adiciona {id, steamId, name, avatar, profileUrl} a estado/players se o
// steamId ainda nao estiver la. estado/players pode ser lista ou objeto
// chaveado — normaliza pra lista. Idempotente.
async function garantirNoRanking(db, steamId, name) {
  const playersRef = db.ref("estado/players");
  const snap = await playersRef.once("value");
  let players = snap.val();
  if (!players) players = [];
  if (!Array.isArray(players)) players = Object.values(players);
  if (players.some((p) => p && p.steamId === steamId)) return; // ja presente
  players.push({
    id: uid(),
    steamId,
    name,
    avatar: "",
    profileUrl: "",
  });
  await playersRef.set(players);
}

// ---- handler ---------------------------------------------------------------

// F1 Fase 4: GET /api/onboard?steamId=X — checa se o jogador ja esta no roster
// (sem mexer nas regras do RTDB; usa o Admin SDK que ja esta wirado).
//
//   200 { onboarded: true, since: "<iso>" }   se roster/{steamId}.status === "active"
//   200 { onboarded: false }                  se nao existe ou status != "active"
//   400 { ok: false, error: "invalid_input" } se steamId malformado
//   500 { ok: false, error: "firebase_not_configured" | "firebase_init_failed" }
async function handleGet(event) {
  const steamId = String(
    (event.queryStringParameters && event.queryStringParameters.steamId) || "",
  ).trim();

  if (!STEAM_ID_RE.test(steamId)) {
    return erro(400, "invalid_input", "steamId invalido. Esperado 17 digitos.");
  }

  if (!process.env.FIREBASE_SA_PATH || !process.env.FIREBASE_DATABASE_URL) {
    return erro(
      500,
      "firebase_not_configured",
      "FIREBASE_SA_PATH e FIREBASE_DATABASE_URL precisam estar no .env.",
    );
  }

  let app;
  try {
    app = initFirebase();
  } catch (e) {
    return erro(500, "firebase_init_failed", e.message || "Nao consegui inicializar o Firebase Admin SDK.");
  }
  if (!app) {
    return erro(500, "firebase_init_failed", "Nao consegui inicializar o Firebase Admin SDK.");
  }

  const db = admin.database();
  const snap = await db.ref(`roster/${steamId}`).once("value");
  const entry = snap.val();
  if (entry && entry.status === "active") {
    return json(200, { onboarded: true, since: entry.updatedAt || null });
  }
  return json(200, { onboarded: false });
}

export const handler = async (event) => {
  if (event.httpMethod === "GET") {
    return handleGet(event);
  }
  if (event.httpMethod !== "POST") {
    return erro(405, "method_not_allowed", "Use POST ou GET.");
  }

  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return erro(
      500,
      "steam_api_key_missing",
      "STEAM_API_KEY nao configurada. Veja .env.",
    );
  }
  if (!process.env.FIREBASE_SA_PATH || !process.env.FIREBASE_DATABASE_URL) {
    return erro(
      500,
      "firebase_not_configured",
      "FIREBASE_SA_PATH e FIREBASE_DATABASE_URL precisam estar no .env.",
    );
  }

  const parsed = parseInput(event.body);
  if (parsed.error) {
    return erro(400, "invalid_input", parsed.error);
  }
  const { authCode, shareCode, steamId: steamIdIn, profileUrl } = parsed;

  try {
    // 1) resolve steamId
    let steamId = steamIdIn;
    if (!steamId) {
      // extrai vanity de profileUrl tipo https://steamcommunity.com/id/<vanity>
      const m = profileUrl.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
      const vanity = m ? decodeURIComponent(m[1]) : profileUrl.replace(/^\/+|\/+$/g, "");
      if (!vanity) {
        return erro(400, "invalid_profile_url", "profileUrl invalida.");
      }
      steamId = await resolverVanity(vanity, key);
    }

    // 2) valida os 2 codes via Steam Web API
    await validarCodes(steamId, authCode, shareCode, key);

    // 3) busca o nome (best effort)
    const name = (await buscarNome(steamId, key)) || "";

    // 4) grava no RTDB
    const app = initFirebase();
    if (!app) {
      return erro(500, "firebase_init_failed", "Nao consegui inicializar o Firebase Admin SDK.");
    }
    const db = admin.database();
    const now = new Date().toISOString();
    await db.ref(`roster/${steamId}`).set({
      name,
      authCode,
      anchorCode: shareCode,
      status: "active",
      updatedAt: now,
    });

    // 5) garante presenca no ranking (estado/players). O onboarding self-serve
    // adiciona o jogador na lista que o site mostra — sem isso, quem onboarda
    // fica invisivel no ranking ate' o organizer cadastrar manualmente.
    // Best-effort: falha aqui nao bloqueia o onboard (roster/ ja' gravou).
    try {
      await garantirNoRanking(db, steamId, name);
    } catch (e) {
      console.error(`[onboard] WARN: nao consegui adicionar ${steamId} ao ranking: ${e.message}`);
    }

    return json(200, { ok: true, steamId, name });
  } catch (err) {
    const status = err.statusCode || 500;
    let code = err.code;
    if (!code) {
      // Deriva um code razoavel a partir do status quando o throw site
      // esqueceu de setar err.code.
      if (status >= 500) code = "internal_error";
      else if (status === 404) code = "not_found";
      else if (status === 400) code = "invalid_input";
      else code = "request_failed";
    }
    return erro(status, code, err.message || "Erro interno.");
  }
};
