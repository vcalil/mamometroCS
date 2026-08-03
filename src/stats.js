import { dados } from "./state.js";
import { partidasDaSeason } from "./seasons.js";

// ---- Taxa de mamada (rating de cada jogador) ------------------------------
// A porcentagem de partidas, entre as que a pessoa JOGOU, em que ela MAMOU
// (não bateu a meta e por isso mamou quem bateu). Normaliza pelo volume: quem
// joga pouco mas mama quase sempre sobe; quem joga muito não infla só pelo
// número de partidas.
//
//   pct = 100 * (partidas em que mamou) / (partidas que jogou)
//
// "Mamou numa partida" = aparece como `from` em alguma mamada dela. "Jogou" =
// aparece nos números (stats) ou entre os envolvidos nas mamadas — assim
// funciona também nas partidas antigas, que só têm entries e não têm stats.
export function taxaMamada(seasonId = "todas") {
  const jogos = {};
  const mamou = {};
  partidasDaSeason(seasonId).forEach((m) => {
    const entries = m.entries || [];
    const participantes = new Set(m.stats ? Object.keys(m.stats) : []);
    entries.forEach((e) => {
      if (e.from) participantes.add(e.from);
      if (e.to) participantes.add(e.to);
    });
    const mamadoresNaPartida = new Set(entries.map((e) => e.from).filter(Boolean));
    participantes.forEach((pid) => {
      jogos[pid] = (jogos[pid] || 0) + 1;
      if (mamadoresNaPartida.has(pid)) mamou[pid] = (mamou[pid] || 0) + 1;
    });
  });
  const mapa = {};
  dados.players.forEach((p) => {
    if (jogos[p.id]) {
      mapa[p.id] = {
        pct: Math.round((100 * (mamou[p.id] || 0)) / jogos[p.id]),
        jogos: jogos[p.id],
        mamou: mamou[p.id] || 0,
      };
    }
  });
  return mapa; // { playerId: { pct, jogos, mamou } }
}

// Calcula os dois lados da moeda:
//   rank      = quem mais MAMOU (deu) e pra quem
//   rankLevou = quem mais FOI MAMADO (levou) e por quem
export function estatisticas(seasonId = "todas") {
  const deu = {},
    levou = {},
    paraQuem = {},
    deQuem = {};
  let totalMamadas = 0;
  dados.players.forEach((p) => {
    deu[p.id] = 0;
    levou[p.id] = 0;
    paraQuem[p.id] = {};
    deQuem[p.id] = {};
  });
  partidasDaSeason(seasonId).forEach((m) => {
    (m.entries || []).forEach((e) => {
      if (deu[e.from] === undefined) return;
      deu[e.from]++;
      totalMamadas++;
      paraQuem[e.from][e.to] = (paraQuem[e.from][e.to] || 0) + 1;
      // O alvo pode ter sido removido do elenco depois — só conta se existir.
      if (levou[e.to] !== undefined) {
        levou[e.to]++;
        deQuem[e.to][e.from] = (deQuem[e.to][e.from] || 0) + 1;
      }
    });
  });
  const monta = (tot, det) =>
    dados.players
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar || "",
        total: tot[p.id] || 0,
        alvos: det[p.id] || {},
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return {
    rank: monta(deu, paraQuem),
    rankLevou: monta(levou, deQuem),
    totalMamadas,
    nPartidas: partidasDaSeason(seasonId).length,
  };
}
