// Fila de partidas enviadas pela galera, aguardando o organizador aprovar.
//
// Fluxo: qualquer pessoa com conta ENVIA -> vai pra `submissoes` -> um
// organizador APROVA -> vira partida em `estado/matches` (com o log de quem
// enviou e quem aprovou) e sai da fila.
//
// As regras do banco garantem isso: criar em `submissoes` qualquer logado
// pode; alterar/remover e gravar em `estado/matches`, só quem está no nó
// `admins`. A interface só reflete o que as regras já impõem.
import { ref, push, remove, set } from "firebase/database";
import { db } from "./firebase.js";
import { dados, salvarPartidas, uid } from "./state.js";

let fila = [];

// Recebe o objeto /submissoes e vira lista ordenada (mais recentes primeiro).
export function setSubmissoes(obj) {
  fila = Object.entries(obj || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
export function listaSubmissoes() {
  return fila;
}

// Envia uma partida pra fila. `entries` = [{ from, to }] já calculado, e
// `stats` guarda os números declarados pra o organizador conferir.
export function enviarSubmissao({ date, entries, stats, autor, origem, validacao }) {
  if (!db) return Promise.resolve();
  return push(ref(db, "submissoes"), {
    date,
    entries,
    stats: stats || null,
    autor, // { steamId, nome }
    origem: origem || "manual", // manual | json | gsi
    validacao: validacao || null, // resultado do Leetify (kills)
    ts: Date.now(),
  });
}

// Aprova: grava a partida no ranking com o log e tira da fila.
export async function aprovarSubmissao(key, aprovador) {
  const s = fila.find((x) => x.key === key);
  if (!s) return;
  dados.matches.push({
    id: uid(),
    date: s.date,
    entries: s.entries || [],
    stats: s.stats || null,
    enviadoPor: s.autor || null,
    enviadoEm: s.ts || null,
    aprovadoPor: aprovador || null,
    aprovadoEm: Date.now(),
  });
  await salvarPartidas();
  await remove(ref(db, "submissoes/" + key));
}

// Recusa: some da fila sem virar partida.
export function recusarSubmissao(key) {
  if (db) return remove(ref(db, "submissoes/" + key));
}

// Usado só pra corrigir a fila manualmente, se precisar.
export function sobrescreverSubmissao(key, dadosNovos) {
  if (db) return set(ref(db, "submissoes/" + key), dadosNovos);
}
