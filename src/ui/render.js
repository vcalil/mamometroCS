import { dados, nomeDe, escapar, salvarPartidas } from "../state.js";
import { estatisticas, taxaMamada } from "../stats.js";
import { configurado } from "../firebase.js";
import { listaSeasons, seasonAtual } from "../seasons.js";
import { usuarioAtual, steamIdDoUser, ehAdmin } from "../auth.js";
import {
  votacaoAtual,
  contarVotos,
  meuVoto,
  iniciarVotacao,
  votar,
  encerrarVotacao,
  PERGUNTA,
} from "../votacao.js";

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
  let html = bannerVotacao() + `<div class="season-bar">
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
      .sort(
        (a, b) => b.pct - a.pct || b.jogos - a.jogos || a.name.localeCompare(b.name)
      );
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
        }</div><div class="info"><div class="nm">${avImg(r.avatar)}${escapar(
          r.name
        )}</div><div class="barra"><span data-pct="${Math.round(
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
    )}${
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

// ---- Banner da votação de reset (aparece na entrada, pra todos) ----
function bannerVotacao() {
  const user = usuarioAtual();
  if (!user) return "";
  const sid = steamIdDoUser(user);
  const admin = ehAdmin();
  const p = votacaoAtual();

  // Sem votação: só o organizador vê o convite pra iniciar.
  if (!p) {
    return admin
      ? `<div class="vt-banner"><div class="vt-q">Abrir uma votação: resetar o Mamômetro agora que dá pra registrar por demo?</div>
           <div class="vt-admin"><button class="btn gold mini" onclick="iniciarVotacaoReset()">Iniciar votação</button></div></div>`
      : "";
  }
  if ((p.status || "aberta") !== "aberta") return ""; // encerrada: some pra todos

  const { reset, continuar, total } = contarVotos(p);
  const meu = meuVoto(sid, p);
  const pctR = total ? Math.round((reset / total) * 100) : 0;
  return `<div class="vt-banner">
    <div class="vt-q">🗳️ ${escapar(p.pergunta || PERGUNTA)}</div>
    <div class="vt-opts">
      <button class="vt-opt ${meu === "reset" ? "on" : ""}" onclick="votarReset('reset')">🔄 Resetar</button>
      <button class="vt-opt ${meu === "continuar" ? "on" : ""}" onclick="votarReset('continuar')">➡️ Continuar</button>
    </div>
    <div class="vt-bar"><span style="width:${pctR}%"></span></div>
    <div class="vt-nums">Resetar <b>${reset}</b> · Continuar <b>${continuar}</b> · ${total} voto(s)${
    meu ? ` — seu voto: <b>${meu === "reset" ? "Resetar" : "Continuar"}</b>` : " — você ainda não votou"
  }</div>
    ${
      admin
        ? `<div class="vt-admin">
      <button class="btn gold mini" onclick="aplicarResetVotacao()">Aplicar: zerar partidas</button>
      <button class="btn sec mini" onclick="encerrarVotacaoReset()">Encerrar sem resetar</button>
    </div>`
        : ""
    }
  </div>`;
}

const autorAtual = () => {
  const sid = steamIdDoUser(usuarioAtual());
  const eu = dados.players.find((p) => p.steamId === sid);
  return { steamId: sid || "", nome: eu ? eu.name : "organizador" };
};

export function iniciarVotacaoReset() {
  if (!ehAdmin()) return;
  iniciarVotacao(autorAtual())
    .then(render)
    .catch((e) => alert("Não deu pra iniciar: " + ((e && e.message) || "")));
}
export function votarReset(escolha) {
  const sid = steamIdDoUser(usuarioAtual());
  if (!sid) return;
  votar(sid, escolha).catch((e) => alert("Não deu pra votar: " + ((e && e.message) || "")));
}
export function encerrarVotacaoReset() {
  if (!ehAdmin()) return;
  if (!confirm("Encerrar a votação SEM resetar?")) return;
  encerrarVotacao("mantido", autorAtual())
    .then(render)
    .catch((e) => alert("Não deu: " + ((e && e.message) || "")));
}
export function aplicarResetVotacao() {
  if (!ehAdmin()) return;
  const { reset, continuar } = contarVotos();
  if (
    !confirm(
      `Zerar TODAS as partidas? (votos: resetar ${reset} x continuar ${continuar})\n\n` +
        "Jogadores e meta continuam. Vou baixar um backup das partidas antes."
    )
  )
    return;
  // Backup client-side das partidas antes de zerar.
  try {
    const blob = new Blob(
      [JSON.stringify({ quando: new Date().toISOString(), matches: dados.matches }, null, 2)],
      { type: "application/json" }
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mamometro-partidas-backup.json";
    a.click();
  } catch {
    /* download é só um extra */
  }
  dados.matches = [];
  Promise.resolve(salvarPartidas())
    .then(() => encerrarVotacao("resetado", autorAtual()))
    .then(() => {
      render();
      alert("Partidas zeradas — o ranking recomeça do zero.");
    })
    .catch((e) => alert("Não deu pra resetar: " + ((e && e.message) || "")));
}
