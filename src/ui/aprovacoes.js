// Aba "Aprovações": fila de partidas enviadas pela galera.
// Só organizador vê e age — e as regras do banco garantem isso do lado de lá.
import { dados, escapar, nomeDe } from "../state.js";
import { usuarioAtual, steamIdDoUser } from "../auth.js";
import {
  listaSubmissoes,
  aprovarSubmissao,
  recusarSubmissao,
} from "../submissoes.js";
import { render } from "./render.js";

const ORIGEM_ROTULO = {
  manual: "na mão",
  json: "JSON",
  gsi: "CS2 (GSI)",
  imagem: "foto do placar",
  demo: "demo do CS2",
};

// Traduz o resultado do Leetify pra um selo curto e honesto.
function seloValidacao(v) {
  if (!v) return `<span class="vd sem">sem dados</span>`;
  if (v.status === "confere")
    return `<span class="vd ok">Leetify confere (${v.declarado}k)</span>`;
  if (v.status === "ambiguo")
    return `<span class="vd amb">Leetify: ${v.jogos
      .map((g) => `${g.kills}k`)
      .join(" ou ")} — mais de uma partida no dia</span>`;
  if (v.status === "difere")
    return `<span class="vd dif">Leetify diz ${v.jogos
      .map((g) => `${g.kills}k`)
      .join("/")} (enviado: ${v.declarado}k)</span>`;
  return `<span class="vd sem">sem dados no Leetify</span>`;
}

export function renderAprovacoes() {
  const el = document.getElementById("pn-aprov");
  if (!el) return;
  const fila = listaSubmissoes();

  if (!fila.length) {
    el.innerHTML = `<div class="aviso">Nenhuma partida esperando aprovação. Quando alguém enviar pelo botão <b>Enviar partida</b>, ela aparece aqui.</div>`;
    return;
  }

  el.innerHTML = fila
    .map((s) => {
      const dataFmt = (s.date || "").split("-").reverse().join("/");
      const quando = s.ts ? new Date(s.ts).toLocaleString("pt-BR") : "";
      const nMamadas = (s.entries || []).length;

      // Números declarados, com a conferência do Leetify ao lado.
      const linhas = Object.entries(s.stats || {})
        .map(([pid, st]) => {
          const p = dados.players.find((x) => x.id === pid);
          const sid = p && p.steamId;
          const v = sid && s.validacao ? s.validacao[sid] : null;
          const kda = `${st.kills ?? "?"}/${st.deaths ?? 0}/${st.assists ?? 0}`;
          const flash = st.flashAssists ? ` 🔦${st.flashAssists}` : "";
          return `<div class="aprov-linha">
            <span class="al-nome">${escapar(p ? p.name : "—")}</span>
            <span class="al-num">${kda} · ${st.damage ?? "?"}d${flash}</span>
            ${seloValidacao(v)}
          </div>`;
        })
        .join("");

      const pares = (s.entries || [])
        .map((e) => `${escapar(nomeDe(e.from))} → ${escapar(nomeDe(e.to))}`)
        .join("<br>");

      return `<div class="aprov-item">
        <div class="ai-topo">
          <div>
            <b>${dataFmt}</b> · ${nMamadas} mamada(s)
            <span class="ai-tag">${ORIGEM_ROTULO[s.origem] || s.origem || "?"}</span>
            ${s.map ? `<span class="ai-tag">🗺️ ${escapar(s.map)}</span>` : ""}
          </div>
          <div class="ai-autor">enviado por <b>${escapar(
            (s.autor && s.autor.nome) || "?"
          )}</b> · ${escapar(quando)}</div>
        </div>
        <div class="aprov-nums">${linhas}</div>
        <details class="ai-det"><summary>ver as mamadas</summary><div class="pares">${pares}</div></details>
        <div class="row-btns">
          <button class="btn gold mini" onclick="aprovar('${s.key}')">Aprovar</button>
          <button class="btn sec mini" onclick="recusar('${s.key}')">Recusar</button>
        </div>
      </div>`;
    })
    .join("");
}

export async function aprovar(key) {
  const user = usuarioAtual();
  const sid = steamIdDoUser(user);
  const eu = dados.players.find((p) => p.steamId === sid);
  try {
    await aprovarSubmissao(key, { steamId: sid || "", nome: eu ? eu.name : "organizador" });
    render();
    renderAprovacoes();
  } catch (e) {
    alert(
      "Não deu pra aprovar. Confira se seu SteamID está no nó `admins` do Firebase.\n\n" +
        ((e && e.message) || "")
    );
  }
}

export async function recusar(key) {
  if (!confirm("Recusar essa partida? Ela some da fila e não entra no ranking.")) return;
  try {
    await recusarSubmissao(key);
    renderAprovacoes();
  } catch (e) {
    alert("Não deu pra recusar: " + ((e && e.message) || ""));
  }
}
