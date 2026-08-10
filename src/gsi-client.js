// Cliente do GSI no navegador: guarda os resultados pendentes recebidos do
// CS2 e gera o arquivo .cfg pronto pra cada jogador colocar na pasta do jogo.
import { ref, remove } from "firebase/database";
import { db } from "./firebase.js";

const env = import.meta.env || {};
// Token compartilhado (vai no .cfg de todo mundo e é conferido pela function).
export const GSI_TOKEN = env.VITE_GSI_TOKEN || "mamometro-gsi";

let pendentes = [];

// Recebe o objeto /gsi/pending do Firebase e vira lista ordenada (recentes 1º).
export function setPendentes(obj) {
  pendentes = Object.entries(obj || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
export function listaPendentes() {
  return pendentes;
}
export function pendentePara(steamId) {
  return steamId ? pendentes.find((p) => p.steamId === steamId) : null;
}
export function descartar(key) {
  if (db) return remove(ref(db, "gsi/pending/" + key));
}

// URL pública do site. O .cfg roda dentro do CS2 do jogador, então NÃO pode
// apontar pra location.origin quando o painel é aberto em localhost — o jogo
// tentaria enviar pra máquina dele. VITE_SITE_URL manda; localhost é ignorado.
const SITE_URL = (() => {
  const cfg = (env.VITE_SITE_URL || "").trim().replace(/\/+$/, "");
  if (cfg) return cfg;
  const org = typeof location !== "undefined" ? location.origin : "";
  return /localhost|127\.0\.0\.1/.test(org) ? "" : org;
})();

// True quando não dá pra montar uma URL que o CS2 consiga alcançar.
export const cfgSemUrlPublica = () => !SITE_URL;

// Monta o conteúdo do .cfg apontando pro site publicado.
export function gerarCfg() {
  const base = SITE_URL || "https://SEU-SITE.netlify.app";
  const uri = `${base}/api/gsi`;
  return `"Mamometro CS - GSI"
{
  "uri" "${uri}"
  "timeout" "5.0"
  "buffer" "0.1"
  "throttle" "2.0"
  "heartbeat" "30.0"
  "auth"
  {
    "token" "${GSI_TOKEN}"
  }
  "data"
  {
    "provider"           "1"
    "map"                "1"
    "round"              "1"
    "player_id"          "1"
    "player_state"       "1"
    "player_match_stats" "1"
  }
}
`;
}

// Dispara o download do arquivo .cfg.
export function baixarCfg() {
  const blob = new Blob([gerarCfg()], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gamestate_integration_mamometro.cfg";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
