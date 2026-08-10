// Histórico das partidas — modal aberto ao clicar no card "Partidas".
// Lista as partidas registradas (dados.matches) da mais recente pra mais antiga.
// Por partida: data, mapa e os números de cada jogador (kills/dano) com ✓ (bateu
// a meta) ou 🍼 (mamou). Partidas antigas sem `stats` caem no fallback das mamadas.

import { dados, statsList, bateuMeta, escapar, nomeDe } from "../state.js";
import { abrirOverlay } from "./overlay.js";

const fmtData = (d) => (d ? d.split("-").reverse().join("/") : "?");

// Linhas de jogador (números) de uma partida com stats.
function linhasStats(m) {
  const meta = m.meta || dados.meta;
  const jogadores = statsList(m)
    .map((s) => ({
      nome: nomeDe(s.id),
      kills: Number(s.kills) || 0,
      damage: Number(s.damage) || 0,
      bateu: bateuMeta(s, meta),
    }))
    .sort((a, b) => b.kills - a.kills || b.damage - a.damage);
  return jogadores
    .map(
      (j) =>
        `<div class="hist-jog ${j.bateu ? "bateu" : "mamou"}">
          <span class="hj-nome">${escapar(j.nome)}</span>
          <span class="hj-num">${j.kills}k · ${j.damage}</span>
          <span class="hj-selo">${j.bateu ? "✓" : "🍼"}</span>
        </div>`
    )
    .join("");
}

// Fallback pras partidas antigas (só entries, sem números): quem mamou quem.
function linhasMamadas(m) {
  const porMamador = {};
  (m.entries || []).forEach((e) => {
    if (!e.from) return;
    (porMamador[e.from] ||= []).push(e.to);
  });
  const linhas = Object.entries(porMamador).map(
    ([from, tos]) =>
      `<div class="hist-jog mamou"><span class="hj-nome">${escapar(
        nomeDe(from)
      )}</span><span class="hj-num">🍼 ${tos
        .map((t) => escapar(nomeDe(t)))
        .join(", ")}</span></div>`
  );
  return linhas.length
    ? linhas.join("")
    : `<div class="dt">Sem detalhes desta partida.</div>`;
}

export function abrirHistorico() {
  const partidas = (dados.matches || [])
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  let corpo;
  if (!partidas.length) {
    corpo = `<div class="vazio">Nenhuma partida registrada ainda.</div>`;
  } else {
    corpo = partidas
      .map((m) => {
        const temStats = statsList(m).length > 0;
        return `<div class="hist-partida">
          <div class="hist-cab">
            <span class="hc-data">${fmtData(m.date)}</span>
            ${m.map ? `<span class="hc-mapa">${escapar(m.map)}</span>` : ""}
          </div>
          ${temStats ? linhasStats(m) : linhasMamadas(m)}
        </div>`;
      })
      .join("");
  }

  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharOverlay()">×</button>
    <h2>Histórico de partidas</h2>
    <div class="sub">${partidas.length} partida(s) registrada(s). ✓ bateu a meta · 🍼 mamou.</div>
    <div class="hist-lista">${corpo}</div>
  `;
  abrirOverlay();
}
