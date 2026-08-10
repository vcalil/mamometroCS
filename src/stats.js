import { dados, statsList } from "./state.js";
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
    // `stats` pode ser array [{id,...}] (partida do admin) ou objeto
    // {id:{...}} (partida enviada) — extrai os ids reais dos dois jeitos.
    const participantes = new Set();
    if (Array.isArray(m.stats)) {
      m.stats.forEach((s) => s && s.id && participantes.add(s.id));
    } else if (m.stats && typeof m.stats === "object") {
      Object.keys(m.stats).forEach((id) => participantes.add(id));
    }
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

// Miolo do cálculo a partir de uma lista de partidas — reusado por
// estatisticas() (por season) e pelos destaques da semana.
//   rank      = quem mais MAMOU (deu) e pra quem
//   rankLevou = quem mais FOI MAMADO (levou) e por quem
function calcDeuLevou(matches) {
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
  matches.forEach((m) => {
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
    nPartidas: matches.length,
  };
}

export function estatisticas(seasonId = "todas") {
  return calcDeuLevou(partidasDaSeason(seasonId));
}

// ---- Destaques da semana + foragido ---------------------------------------

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

// Semana atual seg–dom, como { inicio, fim } em YYYY-MM-DD (datas locais).
export function semanaAtual(hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = segunda ... 6 = domingo
  const seg = new Date(d);
  seg.setDate(d.getDate() - dow);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { inicio: ymd(seg), fim: ymd(dom) };
}

// Top1 de quem mais mamou e de quem mais foi mamado NA SEMANA atual.
// Cada um é { id, name, avatar, total, ... } ou null (ninguém com total > 0).
export function destaquesSemana() {
  const { inicio, fim } = semanaAtual();
  const daSemana = dados.matches.filter(
    (m) => m.date && m.date >= inicio && m.date <= fim
  );
  const { rank, rankLevou } = calcDeuLevou(daSemana);
  const top = (arr) => (arr[0] && arr[0].total > 0 ? arr[0] : null);
  return { topMamou: top(rank), topMamado: top(rankLevou) };
}

// Foragido: jogador registrado que já jogou ≥1 vez com a última aparição mais
// antiga. "Aparição" = está nos stats ou nas entries de uma partida. Novatos que
// nunca jogaram são ignorados. Retorna { id, diasSemJogar } ou null.
export function foragido(hoje = new Date()) {
  const ultima = {}; // id -> maior data (YYYY-MM-DD) de aparição
  dados.matches.forEach((m) => {
    if (!m.date) return;
    const ids = new Set(statsList(m).map((s) => s.id));
    (m.entries || []).forEach((e) => {
      if (e.from) ids.add(e.from);
      if (e.to) ids.add(e.to);
    });
    ids.forEach((id) => {
      if (id && (!ultima[id] || m.date > ultima[id])) ultima[id] = m.date;
    });
  });
  let alvo = null;
  dados.players.forEach((p) => {
    const u = ultima[p.id];
    if (!u) return; // nunca jogou — não é "sumido"
    if (!alvo || u < alvo.data) alvo = { id: p.id, data: u };
  });
  if (!alvo) return null;
  const hj = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const [y, mo, da] = alvo.data.split("-").map(Number);
  const dias = Math.max(0, Math.round((hj - new Date(y, mo - 1, da)) / 86400000));
  return { id: alvo.id, diasSemJogar: dias };
}
