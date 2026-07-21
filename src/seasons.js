// Temporadas do CS2. A Valve NÃO expõe API de calendário — as datas são
// anunciadas por blog. Então o site nasce com as oficiais já conhecidas e o
// organizador ajusta/adiciona quando a próxima for anunciada.
import { ref, set } from "firebase/database";
import { db } from "./firebase.js";
import { dados } from "./state.js";

// Datas oficiais do Premier. `fimEstimado` marca o que a Valve ainda não
// confirmou — a interface avisa, pra ninguém tratar chute como fato.
export const SEASONS_PADRAO = [
  { id: "s3", nome: "Season 3", inicio: "2025-07-15", fim: "2026-01-19" },
  { id: "s4", nome: "Season 4", inicio: "2026-01-20", fim: "2026-07-05" },
  { id: "s5", nome: "Season 5", inicio: "2026-07-06", fim: "2027-01-05", fimEstimado: true },
];

let seasons = SEASONS_PADRAO.slice();

export function setSeasons(obj) {
  const lista = Array.isArray(obj) ? obj : Object.values(obj || {});
  seasons = lista.length ? lista.slice() : SEASONS_PADRAO.slice();
  seasons.sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));
}
export const listaSeasons = () => seasons;

export function salvarSeasons(lista) {
  if (db) return set(ref(db, "seasons"), lista);
}

// Season que contém uma data (YYYY-MM-DD).
export function seasonDe(data) {
  if (!data) return null;
  return (
    seasons.find((s) => data >= s.inicio && (!s.fim || data <= s.fim)) || null
  );
}

// Season vigente hoje (ou a última que existir, se hoje estiver num vão).
export function seasonAtual(hoje = new Date().toISOString().slice(0, 10)) {
  return seasonDe(hoje) || seasons[seasons.length - 1] || null;
}

// Partidas de uma season (ou todas, se `id` for "todas").
export function partidasDaSeason(id) {
  if (id === "todas") return dados.matches;
  const s = seasons.find((x) => x.id === id);
  if (!s) return dados.matches;
  return dados.matches.filter(
    (m) => m.date && m.date >= s.inicio && (!s.fim || m.date <= s.fim)
  );
}
