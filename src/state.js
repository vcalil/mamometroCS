import { ref, set } from "firebase/database";
import { db } from "./firebase.js";

// Meta padrão: matar 15 e causar 1500 de dano. O admin pode alterar.
export const META_PADRAO = { kills: 15, damage: 1500 };

// Estado compartilhado. Sempre MUTAR as propriedades (players/matches/meta),
// nunca reatribuir o objeto `dados` em si — assim todos os módulos que o
// importam continuam enxergando a mesma referência.
export const dados = { players: [], matches: [], meta: { ...META_PADRAO } };

// ---- Sinal de "os dados já chegaram" -------------------------------------
// As regras exigem login pra ler o banco, então logo após o cadastro/login o
// primeiro snapshot ainda está a caminho. Quem precisa da lista de jogadores
// (ex.: a tela de vincular card) tem que esperar — senão lê um array vazio.
let carregado = false;
let aguardando = [];

export const dadosCarregados = () => carregado;

// Resolve com true quando o snapshot chegar; false se estourar o tempo.
export function aguardarDados(timeoutMs = 10000) {
  if (carregado) return Promise.resolve(true);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), timeoutMs);
    aguardando.push(() => {
      clearTimeout(t);
      resolve(true);
    });
  });
}

// Chamado no logout: o próximo login espera o snapshot dele, não o do anterior.
export function resetarCarga() {
  carregado = false;
}

// Substitui o conteúdo a partir de um snapshot do Firebase (mutação in place).
export function aplicarSnapshot(v) {
  dados.players = (v && v.players) || [];
  dados.matches = (v && v.matches) || [];
  const m = v && v.meta;
  dados.meta =
    m && Number.isFinite(m.kills) && Number.isFinite(m.damage)
      ? { kills: m.kills, damage: m.damage }
      : { ...META_PADRAO };
  carregado = true;
  aguardando.splice(0).forEach((fn) => fn());
}

// Casa uma entrada (de JSON/import) com um jogador cadastrado: por SteamID
// (preferência) ou por nome (case-insensitive). Retorna o jogador ou null.
export function acharJogadorPorStat(e) {
  const sid = e.steamId || e.steamid || e.steamID;
  if (sid) {
    const p = dados.players.find((x) => x.steamId === String(sid));
    if (p) return p;
  }
  const nome = String(e.name || e.nome || "")
    .trim()
    .toLowerCase();
  if (nome) return dados.players.find((x) => x.name.toLowerCase() === nome);
  return null;
}

// Normaliza os stats de uma partida pra lista [{id, kills, damage, ...}].
// Aceita array [{id,...}] (partida do admin) ou objeto {id:{...}} (envio).
export function statsList(m) {
  if (!m || !m.stats) return [];
  if (Array.isArray(m.stats)) return m.stats.filter(Boolean);
  if (typeof m.stats === "object")
    return Object.entries(m.stats).map(([id, v]) => ({ id, ...(v || {}) }));
  return [];
}

// ---- Detecção de partida duplicada ----------------------------------------
// Assinatura forte: data + mapa + (id:kills:dano de cada participante), ordenada.
// Dois envios da MESMA partida dão a mesma assinatura; partidas diferentes (até
// no mesmo dia, com a mesma galera) diferem nos números.
export function assinaturaPartida(m) {
  const corpo = statsList(m)
    .map((s) => `${s.id}:${Number(s.kills) || 0}:${Number(s.damage) || 0}`)
    .sort()
    .join("|");
  return `${m.date || ""}#${String(m.map || "").toLowerCase()}#${corpo}`;
}

// Conjunto de participantes (por id): junta quem aparece em stats e em entries.
function participantesSet(m) {
  const set = new Set(
    statsList(m)
      .map((s) => s.id)
      .filter(Boolean)
  );
  (m.entries || []).forEach((e) => {
    if (e.from) set.add(e.from);
    if (e.to) set.add(e.to);
  });
  return set;
}

// Procura duplicata de `nova` entre `existentes`. Retorna:
//   { tipo: "exata", ref }    -> data, jogadores E números iguais (quase certo)
//   { tipo: "provavel", ref } -> mesma data e mesmos jogadores (números diferem)
//   null                       -> nada parecido
export function acharDuplicata(nova, existentes) {
  const assin = assinaturaPartida(nova);
  const part = participantesSet(nova);
  if (!part.size) return null;
  let provavel = null;
  for (const m of existentes || []) {
    if (assinaturaPartida(m) === assin) return { tipo: "exata", ref: m };
    if (!provavel && (m.date || "") === (nova.date || "")) {
      const pm = participantesSet(m);
      if (pm.size === part.size && [...part].every((id) => pm.has(id)))
        provavel = { tipo: "provavel", ref: m };
    }
  }
  return provavel;
}

// Um jogador bateu a meta se atingiu kills E dano (comparado à meta dada).
export function bateuMeta(stat, meta = dados.meta) {
  const k = Number(stat && stat.kills) || 0;
  const d = Number(stat && stat.damage) || 0;
  return k >= meta.kills && d >= meta.damage;
}

// Uma partida NÃO CONTA quando TODOS os participantes (com números) bateram a
// meta: ninguém mamou ninguém, então ela não entra no ranking/rate/contagem.
// Partidas antigas sem números (só entries) sempre contam — elas têm mamada.
export function todosBateram(m) {
  const lista = statsList(m);
  if (!lista.length) return false;
  const meta = (m && m.meta) || dados.meta;
  return lista.every((s) => bateuMeta(s, meta));
}

// As regras separam os ramos de `estado`: elenco é livre pra quem tem conta
// (vínculo de card), partidas e meta são só do organizador. Por isso cada
// gravação vai no seu ramo — um set() no nó inteiro seria recusado.
//
// TRAVA DE SEGURANÇA: como esses `set` sobrescrevem o nó INTEIRO, gravar antes
// do primeiro snapshot chegar (dados ainda vazios) apagaria tudo. Então nunca
// grava players/matches sem os dados terem carregado. (meta é escalar, sem risco.)
export function salvarJogadores() {
  if (!carregado) return Promise.resolve();
  if (db) return set(ref(db, "estado/players"), dados.players);
}
export function salvarPartidas() {
  if (!carregado) return Promise.resolve();
  if (db) return set(ref(db, "estado/matches"), dados.matches);
}
export function salvarMeta() {
  if (db) return set(ref(db, "estado/meta"), dados.meta);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const nomeDe = (id) => (dados.players.find((p) => p.id === id) || {}).name || "—";

// Selo do CS Rating (Premier) pra mostrar ao lado do nome. Só aparece se veio
// da demo (rankType 11 = Premier) e é > 0. Aceita player ou id.
export function rankBadgeHtml(p) {
  const player = typeof p === "string" ? dados.players.find((x) => x.id === p) : p;
  if (!player || player.rankType !== 11 || !player.csRating) return "";
  const fmt = Number(player.csRating).toLocaleString("pt-BR");
  return ` <span class="csrank" title="CS Rating (Premier)">⭐ ${fmt}</span>`;
}

// Nome (da Steam) + apelido ao lado, como HTML. Aceita um player ou um id.
// Ex.: "Rato Molhado do Piauí <span class="apelido">(Iago)</span>".
export function nomeApelidoHtml(p) {
  const player = typeof p === "string" ? dados.players.find((x) => x.id === p) : p;
  if (!player) return "—";
  const nome = escapar(player.name || "—");
  return player.apelido
    ? `${nome} <span class="apelido">(${escapar(player.apelido)})</span>`
    : nome;
}

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
      })[c]
  );
}
