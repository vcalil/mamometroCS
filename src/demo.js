// Leitura da demo (.dem) do CS2 DENTRO do navegador, via WebAssembly.
//
// Por que assim: OCR de placar erra muito, e parsear demo no servidor exige
// infra fora do Netlify. O demoparser2 traz um build WASM que roda 100% no
// cliente (nada é enviado pra lugar nenhum) e devolve os NÚMEROS EXATOS do
// placar — kills e dano de TODOS — a partir de UMA pessoa que baixou a demo.
//
// Fonte preferida: os totais do placar (kills_total/damage_total) no último
// tick, que são exatamente o que o CS2 mostra. Se algum campo faltar numa
// versão de demo, cai no fallback somando os eventos player_death/player_hurt.
//
// O WASM (~2MB) é carregado sob demanda (import dinâmico) pra não pesar no
// bundle inicial de quem não usa a demo.

const ehSteamValido = (sid) => /^\d{17}$/.test(String(sid || ""));

// Carrega o módulo WASM uma vez e reaproveita nas próximas leituras.
// O pkg é vendorizado em src/vendor/demoparser2/ — foi compilado do código-fonte
// do demoparser (o build publicado no npm é da era CS:GO e NÃO lê CS2). O
// import é dinâmico pra não pesar no bundle inicial (~2.9MB de wasm).
let wasmPromise = null;
async function carregarWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const [glue, wasmUrl] = await Promise.all([
        import("./vendor/demoparser2/demoparser2.js"),
        import("./vendor/demoparser2/demoparser2_bg.wasm?url").then((m) => m.default),
      ]);
      await glue.default({ module_or_path: wasmUrl }); // init
      // O serde-wasm-bindgen devolve Map (não objeto). Normaliza pra objeto
      // pra o resto do código acessar r.steamid, r.kills_total, etc.
      const toObj = (x) => (x instanceof Map ? Object.fromEntries(x) : x);
      const toArr = (a) => (Array.isArray(a) ? a.map(toObj) : a);
      return {
        parseEvent: (bytes, ev) => toArr(glue.parseEvent(bytes, ev)),
        parseTicks: (bytes, props, ticks) => toArr(glue.parseTicks(bytes, props, ticks)),
        parseHeader: (bytes) => toObj(glue.parseHeader(bytes)),
      };
    })();
  }
  return wasmPromise;
}

// Último tick "de verdade": o fim de partida traz os totais já fechados.
function ultimoTick(parseEvent, bytes) {
  for (const ev of ["cs_win_panel_match", "round_officially_ended", "round_end"]) {
    try {
      const arr = parseEvent(bytes, ev);
      if (Array.isArray(arr) && arr.length) {
        const t = Math.max(...arr.map((e) => Number(e.tick) || 0));
        if (t > 0) return t;
      }
    } catch {
      /* evento pode não existir nesta demo */
    }
  }
  try {
    const deaths = parseEvent(bytes, "player_death") || [];
    if (deaths.length) return Math.max(0, ...deaths.map((e) => Number(e.tick) || 0));
  } catch {
    /* sem mortes? demo estranha */
  }
  return null;
}

// Preferido: totais do placar (KDA, dano, dano de granada, flashes) no último
// tick — exatamente os números que o CS2 mostra na tabela.
function porTotais(parseTicks, bytes, tick) {
  if (!tick && tick !== 0) return null;
  const props = [
    "kills_total",
    "assists_total",
    "deaths_total",
    "damage_total",
    "utility_damage_total",
    "enemies_flashed_total",
    "headshot_kills_total",
    "mvps",
    "rank", // CS Rating (Premier quando comp_rank_type === 11)
    "comp_rank_type",
  ];
  let rows;
  try {
    rows = parseTicks(bytes, props, Int32Array.from([tick]));
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || !rows.length) return null;

  const num = (v) => Number(v) || 0;
  const porSid = new Map();
  for (const r of rows) {
    const sid = String(r.steamid || r.steam_id || "");
    if (!ehSteamValido(sid)) continue;
    if (r.damage_total == null && r.kills_total == null) continue;
    porSid.set(sid, {
      name: r.name || sid,
      steamId: sid,
      kills: num(r.kills_total),
      deaths: num(r.deaths_total),
      assists: num(r.assists_total),
      damage: num(r.damage_total),
      utilityDamage: num(r.utility_damage_total),
      enemiesFlashed: num(r.enemies_flashed_total),
      hsKills: num(r.headshot_kills_total),
      mvps: num(r.mvps),
      csRating: num(r.rank),
      rankType: num(r.comp_rank_type),
    });
  }
  const lista = [...porSid.values()];
  // Se ninguém tem dano, o prop não existe nesta versão — deixa o fallback agir.
  if (!lista.length || lista.every((p) => p.damage === 0)) return null;
  return lista;
}

// Assistências de flash ("com granada"): mortes em que a pessoa cegou a vítima.
// Conta os player_death com `assistedflash`, por assister. Retorna {sid: n}.
function flashAssistsPorSid(parseEvent, bytes) {
  const out = {};
  let deaths = [];
  try {
    deaths = parseEvent(bytes, "player_death") || [];
  } catch {
    return out;
  }
  for (const e of deaths) {
    if (!e.assistedflash) continue;
    const sid = String(e.assister_steamid || "");
    if (ehSteamValido(sid)) out[sid] = (out[sid] || 0) + 1;
  }
  return out;
}

// Fallback: soma os eventos. player_death → kills; player_hurt → dano.
// (Inclui fogo amigo no dano; por isso os totais são preferidos.)
function porEventos(parseEvent, bytes) {
  const nome = {};
  const kills = {};
  const dano = {};
  const registra = (sid, nm) => {
    if (ehSteamValido(sid) && nm) nome[sid] = nm;
  };

  let deaths = [];
  try {
    deaths = parseEvent(bytes, "player_death") || [];
  } catch {
    deaths = [];
  }
  for (const e of deaths) {
    const a = String(e.attacker_steamid || "");
    const v = String(e.user_steamid || "");
    registra(a, e.attacker_name);
    registra(v, e.user_name);
    if (ehSteamValido(a) && a !== v) kills[a] = (kills[a] || 0) + 1;
  }

  const mortes = {};
  const assist = {};
  for (const e of deaths) {
    const v = String(e.user_steamid || "");
    const as = String(e.assister_steamid || "");
    if (ehSteamValido(v)) mortes[v] = (mortes[v] || 0) + 1;
    if (ehSteamValido(as)) assist[as] = (assist[as] || 0) + 1;
  }

  const GRANADA = /grenade|molotov|inferno|incgrenade|hegrenade|flashbang/i;
  let hurts = [];
  try {
    hurts = parseEvent(bytes, "player_hurt") || [];
  } catch {
    hurts = [];
  }
  const danoUtil = {};
  for (const e of hurts) {
    const a = String(e.attacker_steamid || "");
    const v = String(e.user_steamid || "");
    registra(a, e.attacker_name);
    if (ehSteamValido(a) && a !== v) {
      const d = Number(e.dmg_health) || 0;
      dano[a] = (dano[a] || 0) + d;
      if (GRANADA.test(String(e.weapon || ""))) danoUtil[a] = (danoUtil[a] || 0) + d;
    }
  }

  const sids = new Set([
    ...Object.keys(nome),
    ...Object.keys(kills),
    ...Object.keys(dano),
    ...Object.keys(mortes),
    ...Object.keys(assist),
  ]);
  const lista = [...sids].filter(ehSteamValido).map((sid) => ({
    name: nome[sid] || sid,
    steamId: sid,
    kills: kills[sid] || 0,
    deaths: mortes[sid] || 0,
    assists: assist[sid] || 0,
    damage: dano[sid] || 0,
    utilityDamage: danoUtil[sid] || 0,
    enemiesFlashed: 0,
    hsKills: 0,
    mvps: 0,
  }));
  return lista.length ? lista : null;
}

// Lê a demo e devolve { players: [{name, steamId, kills, damage}], map, fonte }.
// `onProgress(msg)` reporta as etapas pra UI (é rápido, mas o arquivo é grande).
export async function lerDemo(file, onProgress) {
  const pintar = (m) => onProgress && onProgress(m);
  pintar("Carregando o leitor de demo… (1ª vez baixa ~2MB)");
  const { parseEvent, parseTicks, parseHeader } = await carregarWasm();

  pintar("Lendo o arquivo…");
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Toda demo do CS2 começa com a assinatura "PBDEMS2" (as antigas, "HL2DEMO").
  // Se não tiver, é outro arquivo — o erro mais comum é subir o ".dem.info"
  // (metadados, alguns KB) no lugar da demo de verdade (centenas de MB).
  const assinatura = String.fromCharCode(...bytes.slice(0, 7));
  if (assinatura !== "PBDEMS2" && assinatura !== "HL2DEMO") {
    const tam = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `Isso não parece uma demo do CS2 (.dem). ${
        /\.info$/i.test(file.name) || file.size < 1024 * 1024
          ? "Parece o arquivo .dem.info (só os metadados). "
          : ""
      }Suba o arquivo .dem de verdade — ele tem centenas de MB (aqui deu ${tam} MB).`
    );
  }

  pintar("Extraindo o placar da demo…");
  let mapa = "";
  try {
    const h = parseHeader(bytes) || {};
    mapa = h.map_name || h.map || "";
  } catch {
    /* header opcional */
  }

  const tick = ultimoTick(parseEvent, bytes);
  let fonte = "totais do placar";
  let jogadores = porTotais(parseTicks, bytes, tick);
  if (!jogadores) {
    fonte = "eventos (kills/hurt)";
    jogadores = porEventos(parseEvent, bytes);
  }

  // Assistências de flash (assist com granada) vêm dos eventos, não dos totais.
  if (jogadores) {
    const flash = flashAssistsPorSid(parseEvent, bytes);
    jogadores.forEach((p) => (p.flashAssists = flash[p.steamId] || 0));
  }
  if (!jogadores || !jogadores.length) {
    throw new Error(
      "Não consegui extrair o placar desta demo. Ela pode estar corrompida ou ser de uma versão que o leitor não entende."
    );
  }
  jogadores.sort((a, b) => b.kills - a.kills || b.damage - a.damage);
  return { players: jogadores, map: mapa, fonte };
}
