// Propostas que mudam as regras do jogo: promover organizador, alterar a meta
// e sugestões da assembleia. Todas passam por votação da MAIORIA dos admins.
//
// (Partida não entra aqui: continua em `submissoes`, com 1 admin só — é rotina
// diária e travar isso em votação só atrasaria a galera.)
import { ref, push, set, update } from "firebase/database";
import { db } from "./firebase.js";
import { listaVotantes } from "./auth.js";

export const TIPOS = {
  admin: "Promover organizador",
  meta: "Alterar a meta",
  regra: "Regra da assembleia",
};

let fila = [];

export function setPropostas(obj) {
  fila = Object.entries(obj || {})
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
export const listaPropostas = () => fila;
export const propostasAbertas = () =>
  fila.filter((p) => (p.status || "aberta") === "aberta");

// Maioria simples dos ORGANIZADORES (master não vota, por decisão de projeto).
// 1 organizador -> 1; 2 -> 2; 3 -> 2; 5 -> 3.
export function votosNecessarios() {
  const n = listaVotantes().length;
  return n ? Math.floor(n / 2) + 1 : 0; // 0 = ninguém pra votar
}
export const temVotantes = () => listaVotantes().length > 0;

export function contarVotos(p) {
  const v = p.votos || {};
  const sim = Object.values(v).filter(Boolean).length;
  const nao = Object.values(v).filter((x) => x === false).length;
  return { sim, nao, total: sim + nao };
}

// Já bateu a maioria? (usado pra aplicar automaticamente ao último voto)
export function temMaioria(p) {
  const n = votosNecessarios();
  return n > 0 && contarVotos(p).sim >= n;
}

export function criarProposta({ tipo, titulo, detalhe, valor, autor }) {
  if (!db) return Promise.resolve();
  return push(ref(db, "propostas"), {
    tipo, // admin | meta | regra
    titulo: titulo || "",
    detalhe: detalhe || "",
    valor: valor || null, // { steamId, nome } no caso admin; { kills, damage } na meta
    autor, // { steamId, nome }
    status: "aberta", // aberta | aprovada | recusada
    ts: Date.now(),
  });
}

// Grava só o PRÓPRIO voto — é o único campo que as regras deixam o admin tocar.
export function votar(key, steamId, sim) {
  if (!db) return Promise.resolve();
  return set(ref(db, `propostas/${key}/votos/${steamId}`), !!sim);
}

// A VOTAÇÃO só decide (status). Quem executa o efeito é o master, num passo
// separado — porque gravar meta e papéis é permissão de master, e antes o
// organizador levava "permissão negada" logo depois de votar.
export function marcarStatus(key, status) {
  if (!db) return Promise.resolve();
  return set(ref(db, `propostas/${key}/status`), status);
}

// Master executou o efeito (mudou a meta, deu o papel...).
export function marcarAplicada(key, quem) {
  if (!db) return Promise.resolve();
  return update(ref(db, `propostas/${key}`), {
    aplicadaPor: quem || null,
    aplicadaEm: Date.now(),
  });
}

// Aprovada pela votação mas ainda sem efeito executado.
export const aguardandoMaster = (p) =>
  (p.status || "aberta") === "aprovada" && !p.aplicadaEm;

// ---- Assembleia: janela de votação automática em dezembro ----
// As sugestões se acumulam o ano todo e só podem ser votadas em dezembro.
export function assembleiaAberta(hoje = new Date()) {
  return hoje.getMonth() === 11; // 11 = dezembro
}
export function diasParaAssembleia(hoje = new Date()) {
  if (assembleiaAberta(hoje)) return 0;
  const alvo = new Date(hoje.getFullYear(), 11, 1);
  if (alvo < hoje) alvo.setFullYear(alvo.getFullYear() + 1);
  return Math.ceil((alvo - hoje) / 86400000);
}
