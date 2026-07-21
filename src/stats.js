import { dados } from "./state.js";
import { partidasDaSeason } from "./seasons.js";

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
