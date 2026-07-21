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

// Monta o conteúdo do .cfg apontando pra ESTE site (location.origin).
export function gerarCfg() {
  const uri = `${location.origin}/.netlify/functions/gsi`;
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
