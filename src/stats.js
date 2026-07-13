import { dados } from "./state.js";

// Calcula o ranking de mamadas: quantas cada um deu e pra quem.
export function estatisticas() {
  const deu = {},
    paraQuem = {};
  let totalMamadas = 0;
  dados.players.forEach((p) => {
    deu[p.id] = 0;
    paraQuem[p.id] = {};
  });
  dados.matches.forEach((m) => {
    (m.entries || []).forEach((e) => {
      if (deu[e.from] === undefined) return;
      deu[e.from]++;
      totalMamadas++;
      paraQuem[e.from][e.to] = (paraQuem[e.from][e.to] || 0) + 1;
    });
  });
  const rank = dados.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar || "",
      total: deu[p.id] || 0,
      alvos: paraQuem[p.id] || {},
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { rank, totalMamadas };
}
