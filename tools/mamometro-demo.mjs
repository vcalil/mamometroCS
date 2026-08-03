// Parser LOCAL de demo do CS2 → JSON pro Mamômetro.
//
// Por que existe: OCR de scoreboard erra muito, e puxar demo no servidor
// (jeito do csstats) exige infra fora do Netlify (worker + bot Steam). Aqui a
// pessoa baixa a demo pelo próprio CS2 (Assistir → suas partidas → Baixar) e
// roda este script na máquina dela. Ele lê os NÚMEROS EXATOS do placar —
// kills e dano de TODOS, a partir de uma pessoa só — e gera o JSON que o site
// já aceita na aba "Por JSON". Nenhum servidor, nenhuma conta Steam de bot.
//
// Uso:
//   node tools/mamometro-demo.mjs partida.dem
//   node tools/mamometro-demo.mjs partida.dem --date 2026-08-01 --out partida.json
//   npm run demo -- partida.dem
//
// A saída (JSON) vai pro stdout e também é salva num arquivo .json ao lado da
// demo. É só copiar/colar no site: Enviar partida → Por JSON.

import pkg from "@laihoe/demoparser2";
import { statSync, writeFileSync, existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const { parseTicks, parseEvent, parseHeader } = pkg;

// ---- Argumentos ------------------------------------------------------------
function ajuda() {
  console.error(`
Mamômetro — parser de demo do CS2

  node tools/mamometro-demo.mjs <arquivo.dem> [opções]

Opções:
  -d, --date YYYY-MM-DD   Data da partida (padrão: data do arquivo .dem)
  -o, --out arquivo.json  Onde salvar (padrão: <demo>.json ao lado da demo)
  -h, --help              Esta ajuda

Como pegar a demo: no CS2, aba Assistir → suas partidas → Baixar.
`);
}

const argv = process.argv.slice(2);
let file = null;
let outPath = null;
let dateOverride = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "-o" || a === "--out") outPath = argv[++i];
  else if (a === "-d" || a === "--date") dateOverride = argv[++i];
  else if (a === "-h" || a === "--help") {
    ajuda();
    process.exit(0);
  } else if (!a.startsWith("-")) file = a;
}

if (!file) {
  ajuda();
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`✖ Não achei o arquivo: ${file}`);
  process.exit(1);
}

// ---- Helpers ---------------------------------------------------------------
// Data (YYYY-MM-DD) a partir do mtime do arquivo — aproxima o dia da partida.
function dataDoArquivo(f) {
  const d = statSync(f).mtime;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ehSteamValido = (sid) => /^\d{17}$/.test(String(sid || ""));

// Último tick "de verdade": o fim de partida traz os totais já fechados.
function ultimoTick(f) {
  for (const ev of ["cs_win_panel_match", "round_officially_ended", "round_end"]) {
    try {
      const arr = parseEvent(f, ev);
      if (Array.isArray(arr) && arr.length) {
        const t = Math.max(...arr.map((e) => Number(e.tick) || 0));
        if (t > 0) return t;
      }
    } catch {
      /* evento pode não existir nesta demo */
    }
  }
  try {
    const deaths = parseEvent(f, "player_death") || [];
    if (deaths.length) return Math.max(0, ...deaths.map((e) => Number(e.tick) || 0));
  } catch {
    /* sem mortes? demo estranha */
  }
  return null;
}

// Preferido: totais do placar (kills/dano acumulados) no último tick. São
// EXATAMENTE os números da tabela do CS2 (dano só a inimigos, sem fogo amigo).
function porTotais(f, tick) {
  if (!tick) return null;
  const props = [
    "kills_total",
    "assists_total",
    "deaths_total",
    "damage_total",
    "utility_damage_total",
    "enemies_flashed_total",
    "headshot_kills_total",
    "mvps",
  ];
  let rows;
  try {
    rows = parseTicks(f, props, [tick]);
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
    });
  }
  const lista = [...porSid.values()];
  // Se ninguém tem dano, o prop não existe nesta versão — deixa o fallback agir.
  if (!lista.length || lista.every((p) => p.damage === 0)) return null;
  return lista;
}

// Assistências de flash ("com granada"): player_death com assistedflash.
function flashAssistsPorSid(f) {
  const out = {};
  let deaths = [];
  try {
    deaths = parseEvent(f, "player_death") || [];
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
function porEventos(f) {
  const nome = {};
  const kills = {};
  const dano = {};
  const registra = (sid, nm) => {
    if (ehSteamValido(sid) && nm) nome[sid] = nm;
  };

  let deaths = [];
  try {
    deaths = parseEvent(f, "player_death") || [];
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

  let hurts = [];
  try {
    hurts = parseEvent(f, "player_hurt") || [];
  } catch {
    hurts = [];
  }
  for (const e of hurts) {
    const a = String(e.attacker_steamid || "");
    const v = String(e.user_steamid || "");
    registra(a, e.attacker_name);
    if (ehSteamValido(a) && a !== v) dano[a] = (dano[a] || 0) + (Number(e.dmg_health) || 0);
  }

  const sids = new Set([...Object.keys(nome), ...Object.keys(kills), ...Object.keys(dano)]);
  const lista = [...sids].filter(ehSteamValido).map((sid) => ({
    name: nome[sid] || sid,
    steamId: sid,
    kills: kills[sid] || 0,
    damage: dano[sid] || 0,
  }));
  return lista.length ? lista : null;
}

// ---- Execução --------------------------------------------------------------
console.error(`Lendo ${basename(file)}…`);

let mapa = "";
try {
  const h = parseHeader(file) || {};
  mapa = h.map_name || h.map || "";
} catch {
  /* header opcional */
}

const tick = ultimoTick(file);
let fonte = "totais do placar";
let jogadores = porTotais(file, tick);
if (!jogadores) {
  fonte = "eventos (kills/hurt)";
  jogadores = porEventos(file);
}

if (!jogadores || !jogadores.length) {
  console.error(
    "✖ Não consegui extrair jogadores desta demo. Ela pode estar corrompida ou ser de uma versão que o parser não entende."
  );
  process.exit(1);
}

// Assistências de flash (assist com granada) vêm dos eventos, não dos totais.
const flash = flashAssistsPorSid(file);
jogadores.forEach((p) => (p.flashAssists = flash[p.steamId] || 0));

jogadores.sort((a, b) => b.kills - a.kills || b.damage - a.damage);

const saida = {
  date: dateOverride || dataDoArquivo(file),
  ...(mapa ? { map: mapa } : {}),
  players: jogadores,
};

const json = JSON.stringify(saida, null, 2);
process.stdout.write(json + "\n");

// Salva um .json ao lado da demo (ou onde --out mandar).
const destino =
  outPath || join(dirname(file), basename(file).replace(/\.dem$/i, "") + ".json");
try {
  writeFileSync(destino, json);
} catch (e) {
  console.error(`(aviso: não deu pra salvar em ${destino}: ${e.message})`);
}

// Resumo legível no stderr (não polui o JSON do stdout).
console.error(`\n✔ ${jogadores.length} jogadores — fonte: ${fonte}${mapa ? ` — mapa: ${mapa}` : ""}`);
console.error(`   ${"nome".padEnd(18)}  K/D/A     dano   🔦flash 💣util`);
for (const p of jogadores) {
  const kda = `${p.kills}/${p.deaths}/${p.assists}`;
  console.error(
    `   ${p.name.padEnd(18).slice(0, 18)} ${kda.padStart(8)} ${String(p.damage).padStart(6)}   ${String(
      p.flashAssists
    ).padStart(4)}  ${String(p.utilityDamage).padStart(5)}`
  );
}
console.error(`\n→ JSON salvo em: ${destino}`);
console.error(`   Cole no site em: Enviar partida → Por JSON.\n`);
