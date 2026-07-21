import { dados, nomeDe, escapar } from "../state.js";
import { estatisticas } from "../stats.js";
import { configurado } from "../firebase.js";

// Tag <img> do avatar (ou vazio se o jogador não tem perfil Steam).
function avImg(url, cls = "av") {
  return url
    ? `<img class="${cls}" src="${escapar(url)}" alt="" loading="lazy">`
    : "";
}

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

export function trocarVisao(v) {
  visao = v;
  render();
}

// Visualizador público: pódio + classificação geral.
export function render() {
  if (!configurado) return;
  const est = estatisticas();
  const { totalMamadas } = est;
  const rank = visao === "deu" ? est.rank : est.rankLevou;
  const t = TEXTOS[visao];
  document.getElementById("st-partidas").textContent = dados.matches.length;
  document.getElementById("st-mamadas").textContent = totalMamadas;
  document.getElementById("st-jogadores").textContent = dados.players.length;
  const alvo = document.getElementById("conteudo");

  if (dados.players.length === 0) {
    alvo.innerHTML = `<div class="vazio">Ainda não há jogadores.<br>O organizador precisa cadastrar a galera e lançar a primeira partida.</div>`;
    return;
  }
  const max = Math.max(1, ...rank.map((r) => r.total));
  const medalhas = ["🥇", "🥈", "🥉"];
  const topo = rank.slice(0, 3);
  let html = `<div class="meta-cap">🎯 Meta: <b>${dados.meta.kills}</b> kills e <b>${dados.meta.damage}</b> de dano</div>`;
  html += `<div class="switch">
      <button class="sw ${
        visao === "deu" ? "on" : ""
      }" onclick="trocarVisao('deu')">Quem mais mamou</button>
      <button class="sw ${
        visao === "levou" ? "on" : ""
      }" onclick="trocarVisao('levou')">Quem mais foi mamado</button>
    </div>`;
  if (totalMamadas > 0) {
    html += `<div class="sec-titulo">${t.podio}</div><div class="podio">`;
    topo.forEach((r, i) => {
      html += `<div class="p-card ${i === 0 ? "ouro" : ""}"><div class="medal">${
        medalhas[i] || ""
      }</div><div class="pos">${i + 1}º</div>${avImg(
        r.avatar,
        "av-podio"
      )}<div class="nome">${escapar(r.name)}</div><div class="qtd">${
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
    }</div><div class="info"><div class="nm">${avImg(r.avatar)}${escapar(
      r.name
    )} <span class="chev">▼</span></div><div class="barra"><span data-pct="${pct}"></span></div></div><div class="cont">${
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
