import { ref, set } from "firebase/database";
import { db } from "./firebase.js";

// Meta padrão: matar 15 e causar 1500 de dano. O admin pode alterar.
export const META_PADRAO = { kills: 15, damage: 1500 };

// Estado compartilhado. Sempre MUTAR as propriedades (players/matches/meta),
// nunca reatribuir o objeto `dados` em si — assim todos os módulos que o
// importam continuam enxergando a mesma referência.
export const dados = { players: [], matches: [], meta: { ...META_PADRAO } };

// Substitui o conteúdo a partir de um snapshot do Firebase (mutação in place).
export function aplicarSnapshot(v) {
  dados.players = (v && v.players) || [];
  dados.matches = (v && v.matches) || [];
  const m = v && v.meta;
  dados.meta =
    m && Number.isFinite(m.kills) && Number.isFinite(m.damage)
      ? { kills: m.kills, damage: m.damage }
      : { ...META_PADRAO };
}

// Casa uma entrada (de JSON/import) com um jogador cadastrado: por SteamID
// (preferência) ou por nome (case-insensitive). Retorna o jogador ou null.
export function acharJogadorPorStat(e) {
  const sid = e.steamId || e.steamid || e.steamID;
  if (sid) {
    const p = dados.players.find((x) => x.steamId === String(sid));
    if (p) return p;
  }
  const nome = String(e.name || e.nome || "").trim().toLowerCase();
  if (nome) return dados.players.find((x) => x.name.toLowerCase() === nome);
  return null;
}

// Um jogador bateu a meta se atingiu kills E dano (comparado à meta dada).
export function bateuMeta(stat, meta = dados.meta) {
  const k = Number(stat && stat.kills) || 0;
  const d = Number(stat && stat.damage) || 0;
  return k >= meta.kills && d >= meta.damage;
}

export function salvar() {
  if (db) set(ref(db, "estado"), dados);
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const nomeDe = (id) =>
  (dados.players.find((p) => p.id === id) || {}).name || "—";

// Avatar de um jogador (ou string vazia se não tiver perfil Steam).
export const avatarDe = (id) =>
  (dados.players.find((p) => p.id === id) || {}).avatar || "";

export function escapar(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );
}
