import {
  dados,
  nomeDe,
  escapar,
  nomeApelidoHtml,
  rankBadgeHtml,
  avatarDe,
} from "../state.js";
import { estatisticas, taxaMamada, destaquesSemana, foragido } from "../stats.js";
import { configurado } from "../firebase.js";
import { listaSeasons, seasonAtual } from "../seasons.js";
import { avImg } from "./overlay.js";

// Duas visões do mesmo ranking. Cada uma troca só os textos.
const TEXTOS = {
  deu: {
    podio: "Pódio da vergonha",
    classe: "Ranking de quem mais mamou",
    rot: "mamou",
    unid: "mamadas",
    det: "Pra quem tá mamando",
    zero: "Ainda não mamou ninguém 😇",
  },
  levou: {
    podio: "Pódio dos mamados",
    classe: "Ranking de quem mais foi mamado",
    rot: "mamado",
    unid: "recebidas",
    det: "Quem tá mamando ele",
    zero: "Ninguém mamou ele ainda 💪",
  },
};

let visao = "deu"; // "deu" = quem mais mamou | "levou" = quem mais foi mamado
let seasonSel = null; // null = ainda não escolhido; resolve pra season atual

export function trocarSeason(id) {
  seasonSel = id;
  render();
}

export function trocarVisao(v) {
  visao = v;
  render();
}

// Visualizador público: pódio + classificação geral.
export function render() {
  if (!configurado) return;
  // Por padrão mostra a season vigente; "todas" junta o histórico inteiro.
  if (seasonSel === null) {
    const sa = seasonAtual();
    seasonSel = sa ? sa.id : "todas";
  }
  const est = estatisticas(seasonSel);
  const mm = taxaMamada(seasonSel); // { playerId: { pct, jogos, mamou } }
  const { totalMamadas } = est;
  const rank = visao === "deu" ? est.rank : est.rankLevou;
  const t = TEXTOS[visao];
  document.getElementById("st-partidas").textContent = est.nPartidas;
  document.getElementById("st-mamadas").textContent = totalMamadas;
  document.getElementById("st-jogadores").textContent = dados.players.length;
  renderDestaques();
  renderBotRun();
  const alvo = document.getElementById("conteudo");

  if (dados.players.length === 0) {
    alvo.innerHTML = `<div class="vazio">Ainda não há jogadores.<br>O organizador precisa cadastrar a galera e lançar a primeira partida.</div>`;
    return;
  }
  const max = Math.max(1, ...rank.map((r) => r.total));
  const medalhas = ["🥇", "🥈", "🥉"];
  const topo = rank.slice(0, 3);
  const seasons = listaSeasons();
  const opcoes = seasons
    .map(
      (s) =>
        `<option value="${s.id}" ${seasonSel === s.id ? "selected" : ""}>${escapar(
          s.nome
        )}</option>`
    )
    .join("");
  let html = `<div class="season-bar">
      <label class="sb-l">Temporada</label>
      <select class="sb-sel" onchange="trocarSeason(this.value)">
        ${opcoes}<option value="todas" ${
          seasonSel === "todas" ? "selected" : ""
        }>Todas (histórico)</option>
      </select>
      ${(() => {
        const s = seasons.find((x) => x.id === seasonSel);
        if (!s) return `<span class="sb-per">todas as partidas</span>`;
        const f = (d) => (d || "").split("-").reverse().join("/");
        return `<span class="sb-per">${f(s.inicio)} – ${f(s.fim)}${
          s.fimEstimado ? " <i>(fim estimado)</i>" : ""
        }</span>`;
      })()}
    </div>
    <div class="meta-cap">🎯 Meta: <b>${dados.meta.kills}</b> kills e <b>${dados.meta.damage}</b> de dano</div>`;
  html += `<div class="switch">
      <button class="sw ${
        visao === "deu" ? "on" : ""
      }" onclick="trocarVisao('deu')">Quem mais mamou</button>
      <button class="sw ${
        visao === "levou" ? "on" : ""
      }" onclick="trocarVisao('levou')">Quem mais foi mamado</button>
      <button class="sw ${
        visao === "taxa" ? "on" : ""
      }" onclick="trocarVisao('taxa')">Maior % de mamada</button>
    </div>`;

  // Visão "taxa": ranking pela % de partidas (das que jogou) em que mamou.
  // Normaliza por volume — quem joga pouco mas mama muito aparece no topo.
  if (visao === "taxa") {
    const lista = Object.entries(mm)
      .map(([id, v]) => {
        const p = dados.players.find((x) => x.id === id) || {};
        return { id, name: p.name || nomeDe(id), avatar: p.avatar || "", ...v };
      })
      .sort((a, b) => b.pct - a.pct || b.jogos - a.jogos || a.name.localeCompare(b.name));
    if (!lista.length) {
      html += `<div class="vazio">Ainda não dá pra calcular — nenhuma partida com jogadores registrada.</div>`;
    } else {
      const maxPct = Math.max(1, ...lista.map((x) => x.pct));
      html += `<div class="sec-titulo">Ranking de mamada 🍼</div>
        <div class="dt" style="text-align:center;margin:-6px 0 12px">% das partidas que jogou em que mamou</div>
        <div class="rank">`;
      lista.forEach((r, i) => {
        html += `<div class="linha"><div class="linha-top"><div class="pos">${
          i + 1
        }</div><div class="info"><div class="nm">${avImg(r.avatar)}${nomeApelidoHtml(
          r.id
        )}${rankBadgeHtml(r.id)}</div><div class="barra"><span data-pct="${Math.round(
          (r.pct / maxPct) * 100
        )}"></span></div></div><div class="cont">${r.pct}<small>% · ${
          r.mamou
        }/${r.jogos}</small></div></div></div>`;
      });
      html += `</div>`;
    }
    alvo.innerHTML = html;
    requestAnimationFrame(() =>
      document
        .querySelectorAll(".barra > span")
        .forEach((s) => (s.style.width = s.dataset.pct + "%"))
    );
    return;
  }
  if (totalMamadas > 0) {
    html += `<div class="sec-titulo">${t.podio}</div><div class="podio">`;
    topo.forEach((r, i) => {
      html += `<div class="p-card ${i === 0 ? "ouro" : ""}"><div class="medal">${
        medalhas[i] || ""
      }</div><div class="pos">${i + 1}º</div>${avImg(
        r.avatar,
        "av-podio"
      )}<div class="nome">${nomeApelidoHtml(r.id)}${rankBadgeHtml(r.id)}</div><div class="qtd">${
        r.total
      }<small>${t.unid}</small></div></div>`;
    });
    for (let i = topo.length; i < 3; i++)
      html += `<div class="p-card" style="opacity:.4"><div class="medal">—</div><div class="pos">${
        i + 1
      }º</div><div class="nome">—</div><div class="qtd">0<small>${t.unid}</small></div></div>`;
    html += `</div>`;
  }
  html += `<div class="sec-titulo">${t.classe}</div><div class="rank">`;
  rank.forEach((r, i) => {
    const pct = Math.round((r.total / max) * 100);
    const alvos = Object.entries(r.alvos).sort((a, b) => b[1] - a[1]);
    const maxAlvo = Math.max(1, ...alvos.map((a) => a[1]));
    let det = alvos.length
      ? alvos
          .map(
            ([tid, c]) =>
              `<div class="alvo"><span class="an">${escapar(
                nomeDe(tid)
              )}</span><span class="ab"><span style="width:${Math.round(
                (c / maxAlvo) * 100
              )}%"></span></span><span class="ac">${c}x</span></div>`
          )
          .join("")
      : `<div class="dt">${t.zero}</div>`;
    html += `<div class="linha ${visao === "levou" ? "inv" : ""}" data-id="${
      r.id
    }"><div class="linha-top" onclick="toggleLinha(this)"><div class="pos">${
      i + 1
    }</div><div class="info"><div class="nm">${avImg(r.avatar)}${nomeApelidoHtml(
      r.id
    )}${rankBadgeHtml(r.id)}${
      mm[r.id]
        ? ` <span class="mm" title="Mamou em ${mm[r.id].mamou} de ${mm[r.id].jogos} partida(s) que jogou">🍼 ${mm[r.id].pct}%</span>`
        : ""
    } <span class="chev">▼</span></div><div class="barra"><span data-pct="${pct}"></span></div></div><div class="cont">${
      r.total
    }<small>${t.rot}</small></div></div><div class="detalhe"><div class="detalhe-in"><div class="dt">${t.det}</div>${det}</div></div></div>`;
  });
  html += `</div>`;
  alvo.innerHTML = html;
  requestAnimationFrame(() =>
    document
      .querySelectorAll(".barra > span")
      .forEach((s) => (s.style.width = s.dataset.pct + "%"))
  );
}

export function toggleLinha(el) {
  el.parentElement.classList.toggle("aberta");
}

// Mostra ao lado do "ao vivo" a última partida que o bot registrou (proxy de
// "quando o bot rodou" — é a última partida capturada, o mais próximo que o
// front sabe sem um heartbeat do pipeline).
function renderBotRun() {
  const el = document.getElementById("bot-run");
  if (!el) return;
  const ult = (dados.matches || []).reduce(
    (mx, m) => (m.date && m.date > mx ? m.date : mx),
    ""
  );
  if (!ult) {
    el.textContent = "";
    return;
  }
  const [y, mo, da] = ult.split("-").map(Number);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje - new Date(y, mo - 1, da)) / 86400000);
  const quando = dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`;
  el.textContent = `· 🤖 última partida ${ult.split("-").reverse().join("/")} (${quando})`;
}

// Um card de destaque (rótulo + subtítulo + avatar em anel + valor em pill),
// ou o estado vazio. `medalha` = mostra a coroa (só nos vencedores da semana).
function cardDestaque(classe, rotulo, sub, id, valor, vazio, medalha) {
  const cab = `<div class="d-rot">${rotulo}</div><div class="d-sub">${sub || "&nbsp;"}</div>`;
  if (!id) {
    return `<div class="destaque ${classe}">${cab}<div class="d-vazio">${vazio}</div></div>`;
  }
  const av = avatarDe(id);
  const avHtml = av ? avImg(av, "d-av") : `<div class="d-av d-av-ph">👤</div>`;
  return `<div class="destaque ${classe}">
      ${cab}
      <div class="d-corpo">
        <div class="d-avwrap ${medalha ? "coroa" : ""}">${avHtml}</div>
        <div class="d-info"><div class="d-nome">${nomeApelidoHtml(
          id
        )}</div><span class="d-val">${valor}</span></div>
      </div>
    </div>`;
}

// Formata um range de semana YYYY-MM-DD → "DD–DD/MM" (ou "DD/MM–DD/MM" se muda o mês).
function fmtRange(a, b) {
  const dm = (s) => `${s.slice(8)}/${s.slice(5, 7)}`;
  return a.slice(5, 7) === b.slice(5, 7) ? `${a.slice(8)}–${dm(b)}` : `${dm(a)}–${dm(b)}`;
}

// Fileira de 3 destaques: mamou mais / botou pra mamar (foi mamado) na semana +
// o foragido (mais tempo sem jogar). Semana/foragido independem da season.
function renderDestaques() {
  const el = document.getElementById("destaques");
  if (!el) return;
  const { topMamou, topMamado, semana } = destaquesSemana();
  const forg = foragido();
  const subSemana = semana
    ? semana.atual
      ? "esta semana"
      : `semana ${fmtRange(semana.inicio, semana.fim)}`
    : "";
  el.innerHTML =
    cardDestaque(
      "d-mamou",
      "🍼 Mamou mais",
      subSemana,
      topMamou && topMamou.id,
      topMamou ? `${topMamou.total} mamada(s)` : "",
      "Ninguém mamou no período",
      true
    ) +
    cardDestaque(
      "d-mamado",
      "🎯 Botou pra mamar",
      subSemana,
      topMamado && topMamado.id,
      topMamado ? `${topMamado.total} recebida(s)` : "",
      "Ninguém foi mamado no período",
      true
    ) +
    cardDestaque(
      "d-foragido",
      "🕵 Foragido",
      "sumido faz tempo",
      forg && forg.id,
      forg ? `${forg.diasSemJogar} dia(s) sem jogar` : "",
      "Todo mundo jogou recente",
      false
    );
}
