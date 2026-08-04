// Enquete de reset: aparece na entrada pra TODO MUNDO votar "resetar" ou
// "continuar". Diferente das propostas (que são só de organizador), aqui
// qualquer conta grava o PRÓPRIO voto — as regras liberam `votacao/reset/votos/
// $steamid` só pro dono do steamid. O organizador inicia, vê a apuração e
// aplica (zera as partidas) ou encerra sem resetar.
import { ref, set, update } from "firebase/database";
import { db } from "./firebase.js";

const CHAVE = "reset";
export const PERGUNTA = "Resetar o Mamômetro agora que dá pra registrar por demo?";

let atual = null; // objeto da enquete (ou null se nunca iniciada)

export function setVotacao(obj) {
  atual = obj && obj[CHAVE] ? { id: CHAVE, ...obj[CHAVE] } : null;
}
export const votacaoAtual = () => atual;
export const votacaoAberta = () => !!atual && (atual.status || "aberta") === "aberta";

export function contarVotos(p = atual) {
  const v = (p && p.votos) || {};
  const vals = Object.values(v);
  const reset = vals.filter((x) => x === "reset").length;
  const continuar = vals.filter((x) => x === "continuar").length;
  return { reset, continuar, total: reset + continuar };
}
export const meuVoto = (steamId, p = atual) =>
  (p && p.votos && steamId && p.votos[steamId]) || null;

// Organizador inicia a votação (cria o nó com status aberto).
export function iniciarVotacao(autor) {
  if (!db) return Promise.resolve();
  return set(ref(db, `votacao/${CHAVE}`), {
    pergunta: PERGUNTA,
    status: "aberta",
    criadaPor: autor || null,
    ts: Date.now(),
  });
}

// Qualquer logado grava só o próprio voto. `escolha` = "reset" | "continuar".
export function votar(steamId, escolha) {
  if (!db || !steamId) return Promise.resolve();
  return set(ref(db, `votacao/${CHAVE}/votos/${steamId}`), escolha);
}

// Organizador encerra. `resultado` = "resetado" | "mantido".
export function encerrarVotacao(resultado, quem) {
  if (!db) return Promise.resolve();
  return update(ref(db, `votacao/${CHAVE}`), {
    status: "encerrada",
    resultado: resultado || null,
    aplicadaPor: quem || null,
    aplicadaEm: Date.now(),
  });
}
