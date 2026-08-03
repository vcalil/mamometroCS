// Diagnóstico: despeja o QUE o demoparser2 realmente devolve, pra calibrar o
// parser (nomes de campos, formato do steamid, props de tick válidas).
// Uso: node tools/diag-demo.mjs [arquivo.dem]   (sem arg, pega o .dem mais novo)
import pkg from "@laihoe/demoparser2";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const { parseHeader, parseEvent, parseTicks, parsePlayerInfo, listGameEvents } = pkg;

let file = process.argv[2];
if (!file) {
  const dems = readdirSync(".")
    .filter((f) => f.toLowerCase().endsWith(".dem"))
    .map((f) => ({ f, t: statSync(f).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!dems.length) {
    console.error("Nenhum .dem na pasta. Passe o caminho: node tools/diag-demo.mjs arquivo.dem");
    process.exit(1);
  }
  file = dems[0].f;
}
console.log("Arquivo:", file, "\n");

const linha = (t) => console.log("\n===== " + t + " =====");
const amostra = (arr, n = 1) =>
  Array.isArray(arr) ? arr.slice(0, n) : arr;

try {
  linha("parseHeader");
  console.log(parseHeader(file));
} catch (e) {
  console.log("ERRO:", e.message);
}

try {
  linha("parsePlayerInfo (steamid + nome)");
  const pi = parsePlayerInfo(file);
  console.log("qtd:", Array.isArray(pi) ? pi.length : typeof pi);
  console.log(amostra(pi, 12));
} catch (e) {
  console.log("ERRO:", e.message);
}

let ultimoTick = null;
try {
  linha("parseEvent player_death — 1º evento (todas as chaves)");
  const d = parseEvent(file, "player_death");
  console.log("qtd:", Array.isArray(d) ? d.length : typeof d);
  if (Array.isArray(d) && d.length) {
    console.log("chaves:", Object.keys(d[0]));
    console.log(d[0]);
    ultimoTick = Math.max(...d.map((e) => Number(e.tick) || 0));
    console.log("último tick (por player_death):", ultimoTick);
  }
} catch (e) {
  console.log("ERRO:", e.message);
}

try {
  linha("parseEvent player_hurt — 1º evento (todas as chaves)");
  const h = parseEvent(file, "player_hurt");
  console.log("qtd:", Array.isArray(h) ? h.length : typeof h);
  if (Array.isArray(h) && h.length) {
    console.log("chaves:", Object.keys(h[0]));
    console.log(h[0]);
  }
} catch (e) {
  console.log("ERRO:", e.message);
}

try {
  linha("parseTicks totais no último tick — 1ª linha (todas as chaves)");
  const props = ["kills_total", "assists_total", "deaths_total", "damage_total"];
  const rows = ultimoTick
    ? parseTicks(file, props, [ultimoTick])
    : parseTicks(file, props);
  console.log("qtd linhas:", Array.isArray(rows) ? rows.length : typeof rows);
  if (Array.isArray(rows) && rows.length) {
    console.log("chaves:", Object.keys(rows[0]));
    console.log(amostra(rows, 12));
  }
} catch (e) {
  console.log("ERRO:", e.message);
}
