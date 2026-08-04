import {
  dados,
  salvarJogadores,
  salvarPartidas,
  salvarMeta as salvarMetaDb,
  uid,
  nomeDe,
  escapar,
  bateuMeta,
  acharJogadorPorStat,
  statsList,
} from "../state.js";
import {
  ehAdmin,
  ehMaster,
  usuarioAtual,
  steamIdDoUser,
  listaPapeis,
  papelDe,
} from "../auth.js";
import { render } from "./render.js";
import { renderAprovacoes } from "./aprovacoes.js";
import { criarProposta, votosNecessarios, temVotantes } from "../propostas.js";
import { listaSeasons, salvarSeasons } from "../seasons.js";
import { db } from "../firebase.js";
import { ref, set } from "firebase/database";
import { buscarPerfilSteam } from "../steam.js";
import {
  listaPendentes,
  pendentePara,
  descartar as descartarGsiPendente,
  baixarCfg,
  gerarCfg,
} from "../gsi-client.js";

// ---- helpers ----
function avImg(url, cls = "av") {
  return url
    ? `<img class="${cls}" src="${escapar(url)}" alt="" loading="lazy">`
    : "";
}
function abrirOverlay() {
  document.getElementById("overlay").classList.add("on");
}
export function fecharOverlay() {
  document.getElementById("overlay").classList.remove("on");
}

// ---- Painel (acesso: admins por SteamID — Vini e Iago) ----
let time = [];
let stats = {}; // { playerId: { kills, damage } } — digitado pelo admin
let dataPartida = new Date().toISOString().slice(0, 10);

export function abrirAdmin() {
  if (!ehAdmin()) {
    alert("Só os organizadores (Vini e Iago) podem abrir o painel. Entre com a Steam.");
    return;
  }
  time = [];
  stats = {};
  dataPartida = new Date().toISOString().slice(0, 10);
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharOverlay()">×</button>
    <h2>Painel do organizador</h2><div class="sub">Cadastre jogadores e registre as partidas. Tudo salva na nuvem e aparece pra todos.</div>
    <div class="tabs">
      <div class="tab ativa" data-t="jog" onclick="trocarTab('jog')">Jogadores</div>
      <div class="tab" data-t="part" onclick="trocarTab('part')">Nova partida</div>
      <div class="tab" data-t="aprov" onclick="trocarTab('aprov')">Aprovações</div>
      <div class="tab" data-t="hist" onclick="trocarTab('hist')">Histórico</div>
      <div class="tab" data-t="gsi" onclick="trocarTab('gsi')">GSI</div>
      <div class="tab" data-t="cfg" onclick="trocarTab('cfg')">Config</div>
      <div class="tab" data-t="ajuda" onclick="trocarTab('ajuda')">Ajuda</div>
    </div>
    <div class="painel ativo" id="pn-jog"></div>
    <div class="painel" id="pn-part"></div>
    <div class="painel" id="pn-aprov"></div>
    <div class="painel" id="pn-hist"></div>
    <div class="painel" id="pn-gsi"></div>
    <div class="painel" id="pn-cfg"></div>
    <div class="painel" id="pn-ajuda"></div>
    <div class="row-btns" style="margin-top:20px"><button class="btn sec" onclick="fecharOverlay()">Fechar</button></div>`;
  renderJogadores();
  renderPartida();
  renderHistorico();
  renderAprovacoes();
  renderGsi();
  renderConfig();
  renderAjudaAdmin();
  abrirOverlay();
}
export function trocarTab(t) {
  document
    .querySelectorAll(".tab")
    .forEach((x) => x.classList.toggle("ativa", x.dataset.t === t));
  document
    .querySelectorAll(".painel")
    .forEach((x) => x.classList.remove("ativo"));
  document.getElementById("pn-" + t).classList.add("ativo");
}

// ---- Aba Jogadores (com integração Steam) ----
let steamPreview = null; // perfil buscado, aguardando confirmação

export function renderJogadores() {
  const el = document.getElementById("pn-jog");
  if (!el) return;
  let chips = dados.players
    .map((p) => {
      // Papel e vínculo com a Steam ficam à vista: é o que explica quem pode
      // o quê, e quem ainda não dá pra promover.
      const papel = papelDe(p.steamId);
      const selo = papel
        ? `<span class="vd ${papel === "master" ? "ok" : "amb"}">${papel}</span>`
        : `<span class="vd sem">comum</span>`;
      const semSteam = p.steamId
        ? ""
        : `<span class="vd dif" title="Ainda não entrou com a Steam — não pode receber papel">sem conta</span>`;
      return `<div class="chip"><span class="chip-nome">${avImg(p.avatar)}${escapar(
        p.name
      )}</span>${selo}${semSteam}<button class="x" onclick="removerJogador('${p.id}')">×</button></div>`;
    })
    .join("");
  if (!chips) chips = `<div class="aviso">Nenhum jogador ainda. Adicione a galera.</div>`;
  el.innerHTML = `<label>Nome do jogador</label>
    <div style="display:flex;gap:8px"><input id="in-nome" placeholder="ex.: Dinbinho" onkeydown="if(event.key==='Enter')addJogador()"><button class="btn mini" onclick="addJogador()">Add</button></div>

    <div class="steam-box">
      <label style="margin-top:0">Adicionar da Steam</label>
      <div class="hint">Cole a URL do perfil (steamcommunity.com/id/... ou /profiles/...) ou o SteamID64.</div>
      <div class="steam-row">
        <input id="in-steam" placeholder="URL ou ID da Steam" onkeydown="if(event.key==='Enter')buscarSteam()">
        <button class="btn mini" id="btn-steam" onclick="buscarSteam()">Buscar</button>
      </div>
      <div class="erro" id="steam-erro"></div>
      <div id="steam-slot"></div>
      <div class="hint" style="margin-top:8px">Quem você adicionar aqui entra depois em <b>Entrar → Cadastrar</b> com o mesmo perfil e <b>cria a própria senha</b> (cai direto no card certo).</div>
    </div>

    <div class="chip-list">${chips}</div>

    ${
      dados.players.length >= 2
        ? `<div class="steam-box">
      <label style="margin-top:0">Mesclar duplicados</label>
      <div class="hint">Se alguém ficou com <b>dois cards</b> (ex.: criou um novo em vez de escolher o antigo), junte-os: as partidas do duplicado passam pro que fica, e a conta Steam/avatar é copiada se faltar.</div>
      <div class="steam-row">
        <select id="merge-keep" style="flex:1;min-width:120px" title="Fica">${mergeOpts()}</select>
        <select id="merge-remove" style="flex:1;min-width:120px" title="Duplicado (será removido)">${mergeOpts()}</select>
        <button class="btn mini" onclick="mesclarJogadores()">Mesclar</button>
      </div>
      <div class="hint">Esquerda = <b>fica</b>. Direita = <b>duplicado</b> (removido).</div>
    </div>`
        : ""
    }`;
  renderSteamSlot();
}

// Opções pros seletores de mescla (mostra se o card já tem Steam vinculada).
function mergeOpts() {
  return dados.players
    .map(
      (p) =>
        `<option value="${p.id}">${escapar(p.name)}${
          p.steamId ? " · steam" : " · sem conta"
        }</option>`
    )
    .join("");
}

// Junta dois cards do mesmo jogador. Remapeia todas as partidas (entries e
// stats, que podem ser array [{id,...}] do admin ou objeto {id:{...}} do envio)
// do duplicado pro que fica, herda Steam/avatar se faltar, e remove o duplicado.
export function mesclarJogadores() {
  const manterId = (document.getElementById("merge-keep") || {}).value;
  const removerId = (document.getElementById("merge-remove") || {}).value;
  if (!manterId || !removerId || manterId === removerId)
    return alert("Escolha dois cards diferentes: o que fica (esquerda) e o duplicado (direita).");
  const manter = dados.players.find((p) => p.id === manterId);
  const remover = dados.players.find((p) => p.id === removerId);
  if (!manter || !remover) return;
  if (
    !confirm(
      `Mesclar "${remover.name}" em "${manter.name}"?\n\n` +
        `• As partidas de "${remover.name}" passam pra "${manter.name}".\n` +
        `• A conta Steam/avatar é copiada pra "${manter.name}" se ele não tiver.\n` +
        `• O card "${remover.name}" é removido.`
    )
  )
    return;

  dados.matches.forEach((m) => {
    // entries: from/to
    if (Array.isArray(m.entries)) {
      m.entries.forEach((e) => {
        if (e.from === removerId) e.from = manterId;
        if (e.to === removerId) e.to = manterId;
      });
      // a mescla pode ter criado "mamada de si mesmo" — descarta.
      m.entries = m.entries.filter((e) => e.from !== e.to);
    }
    // stats em array [{id,...}]
    if (Array.isArray(m.stats)) {
      const manterJaTem = m.stats.some((s) => s.id === manterId);
      if (manterJaTem) {
        m.stats = m.stats.filter((s) => s.id !== removerId);
      } else {
        m.stats.forEach((s) => {
          if (s.id === removerId) s.id = manterId;
        });
      }
    } else if (m.stats && typeof m.stats === "object") {
      // stats em objeto {id:{...}}
      if (m.stats[removerId]) {
        if (!m.stats[manterId]) m.stats[manterId] = m.stats[removerId];
        delete m.stats[removerId];
      }
    }
  });

  // Herda identidade Steam pro sobrevivente, se faltar.
  if (!manter.steamId && remover.steamId) manter.steamId = remover.steamId;
  if (!manter.avatar && remover.avatar) manter.avatar = remover.avatar;
  if (!manter.profileUrl && remover.profileUrl) manter.profileUrl = remover.profileUrl;

  dados.players = dados.players.filter((p) => p.id !== removerId);
  salvarJogadores();
  salvarPartidas();
  renderJogadores();
  renderPartida();
  render();
  alert(`Pronto — "${remover.name}" foi mesclado em "${manter.name}".`);
}

function renderSteamSlot() {
  const slot = document.getElementById("steam-slot");
  if (!slot) return;
  if (!steamPreview) {
    slot.innerHTML = "";
    return;
  }
  slot.innerHTML = `
    <div class="steam-preview">
      ${avImg(steamPreview.avatar, "")}
      <div style="flex:1;min-width:0">
        <div class="nm">${escapar(steamPreview.name)}</div>
        <div class="id">${escapar(steamPreview.steamId)}</div>
      </div>
    </div>
    <div class="row-btns">
      <button class="btn gold mini" onclick="confirmarSteam()">Adicionar esse</button>
      <button class="btn sec mini" onclick="limparSteam()">Cancelar</button>
    </div>`;
}

export async function buscarSteam() {
  const inp = document.getElementById("in-steam");
  const btn = document.getElementById("btn-steam");
  const erro = document.getElementById("steam-erro");
  erro.textContent = "";
  steamPreview = null;
  renderSteamSlot();
  const texto = inp.value.trim();
  if (!texto) {
    erro.textContent = "Cole a URL ou o ID do perfil.";
    return;
  }
  btn.disabled = true;
  btn.textContent = "Buscando...";
  try {
    steamPreview = await buscarPerfilSteam(texto);
    renderSteamSlot();
  } catch (e) {
    erro.textContent = e.message || "Não deu pra buscar o perfil.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Buscar";
  }
}
export function confirmarSteam() {
  if (!steamPreview) return;
  const jaExiste = dados.players.some(
    (p) => p.steamId && p.steamId === steamPreview.steamId
  );
  if (jaExiste) {
    document.getElementById("steam-erro").textContent =
      "Esse jogador já está cadastrado.";
    return;
  }
  dados.players.push({
    id: uid(),
    name: steamPreview.name,
    steamId: steamPreview.steamId,
    avatar: steamPreview.avatar || "",
    profileUrl: steamPreview.profileUrl || "",
  });
  salvarJogadores();
  steamPreview = null;
  renderJogadores();
  renderPartida();
  render();
}
export function limparSteam() {
  steamPreview = null;
  const inp = document.getElementById("in-steam");
  if (inp) inp.value = "";
  const erro = document.getElementById("steam-erro");
  if (erro) erro.textContent = "";
  renderSteamSlot();
}

export function addJogador() {
  const inp = document.getElementById("in-nome");
  const nome = inp.value.trim();
  if (!nome) return;
  dados.players.push({ id: uid(), name: nome });
  salvarJogadores();
  renderJogadores();
  renderPartida();
  render();
  inp.value = "";
  inp.focus();
}
export function removerJogador(id) {
  if (!confirm("Remover esse jogador? As mamadas dele somem do ranking.")) return;
  dados.players = dados.players.filter((p) => p.id !== id);
  salvarJogadores();
  renderJogadores();
  renderPartida();
  render();
}

// ---- Aba Nova partida (com meta editável + kills/dano por jogador) ----
// Separa o time entre quem bateu a meta (winners) e quem não bateu (losers).
function separarTime() {
  const winners = time.filter((id) => bateuMeta(stats[id]));
  const losers = time.filter((id) => !bateuMeta(stats[id]));
  return { winners, losers };
}

export function renderPartida() {
  const el = document.getElementById("pn-part");
  if (!el) return;

  // Editor da meta aparece sempre (mesmo com <2 jogadores).
  const metaEditor = `
    <div class="meta-editor">
      <label style="margin-top:0">Meta da partida</label>
      <div class="meta-inputs">
        <input type="number" min="0" id="meta-kills" value="${dados.meta.kills}"><span class="mu">kills</span>
        <input type="number" min="0" id="meta-damage" value="${dados.meta.damage}"><span class="mu">dano</span>
        <button class="btn mini" onclick="salvarMeta()">Salvar meta</button>
      </div>
      <div class="hint">Quem atingir <b>kills E dano</b> bateu a meta. Vale pras próximas partidas.</div>
    </div>`;

  if (dados.players.length < 2) {
    el.innerHTML =
      metaEditor +
      `<div class="aviso">Cadastre pelo menos 2 jogadores na aba "Jogadores" pra lançar uma partida.</div>`;
    return;
  }

  // Importar a partida inteira de um JSON (sobe arquivo ou cola o texto).
  const importBox = `
    <div class="json-box">
      <label style="margin-top:0">Importar de JSON</label>
      <div class="hint">Sobe um arquivo <code>.json</code> ou cola o conteúdo — preenche time, kills e dano de uma vez. Casa por SteamID ou nome.</div>
      <input type="file" accept=".json,application/json" id="in-json" class="json-file" onchange="importarJsonArquivo(this)">
      <textarea id="ta-json" class="json-ta" placeholder='[{"name":"Charlinho","kills":18,"damage":2100}, {"name":"Iago","kills":9,"damage":1200}]'></textarea>
      <div class="steam-row">
        <button class="btn mini" onclick="importarJsonTexto()">Importar do texto</button>
        <button class="btn mini sec" onclick="verExemploJson()">Ver exemplo</button>
      </div>
      <div class="erro" id="json-status"></div>
    </div>`;

  const disp = dados.players.filter((p) => !time.includes(p.id));
  const noTime = time.map((id) => dados.players.find((p) => p.id === id)).filter(Boolean);

  const dispHtml = disp.length
    ? disp
        .map(
          (p) =>
            `<button class="tchip" onclick="addAoTime('${p.id}')">${avImg(
              p.avatar
            )}${escapar(p.name)}<span>＋</span></button>`
        )
        .join("")
    : `<div class="tvazio">todos já no time</div>`;
  const timeHtml = noTime.length
    ? noTime
        .map(
          (p) =>
            `<button class="tchip sel" onclick="removerDoTime('${p.id}')">${avImg(
              p.avatar
            )}${escapar(p.name)}<span>×</span></button>`
        )
        .join("")
    : `<div class="tvazio">toque nos nomes ao lado pra montar o time</div>`;

  let statsHtml = "",
    previewHtml = "";
  if (time.length >= 2) {
    statsHtml =
      `<label>Kills e dano de cada um</label><div class="stat-list">` +
      noTime
        .map((p) => {
          const s = stats[p.id] || {};
          const pend = pendentePara(p.steamId);
          const gsiHint = pend
            ? `<div class="gsi-hint">🎮 GSI: <b>${pend.kills}</b>k / <b>${
                pend.damage
              }</b>d${pend.map ? ` · ${escapar(pend.map)}` : ""} <button class="btn mini gold" onclick="usarGsi('${
                pend.key
              }','${p.id}')">usar</button></div>`
            : "";
          return `<div class="stat-row">
            <span class="sr-nome">${avImg(p.avatar)}${escapar(p.name)}</span>
            <input type="number" min="0" class="sr-in" placeholder="kills" value="${
              s.kills ?? ""
            }" oninput="setStat('${p.id}','kills',this.value)">
            <input type="number" min="0" class="sr-in" placeholder="dano" value="${
              s.damage ?? ""
            }" oninput="setStat('${p.id}','damage',this.value)">
            <span class="sr-ok" id="ok-${p.id}">${bateuMeta(s) ? "✅" : "❌"}</span>
          </div>${gsiHint}`;
        })
        .join("") +
      `</div>`;
    previewHtml = `<div class="preview" id="part-preview">${textoPreview()}</div>`;
  }

  el.innerHTML = `
    ${metaEditor}
    ${importBox}
    <label>Data da partida</label>
    <input type="date" id="in-data" value="${dataPartida}" onchange="setDataPartida(this.value)">
    <label>Quem estava no time?</label>
    <div class="transfer">
      <div class="tcol"><h4>Cadastrados</h4>${dispHtml}</div>
      <div class="tcol"><h4>No time</h4>${timeHtml}</div>
    </div>
    ${statsHtml}
    ${previewHtml}
    ${
      time.length >= 2
        ? `<div class="row-btns"><button class="btn gold" onclick="salvarPartida()">Salvar partida</button></div>`
        : ""
    }`;
}

// Texto do preview: quem mama quem, conforme a meta atual.
function textoPreview() {
  const { winners, losers } = separarTime();
  const nome = (id) => escapar(nomeDe(id));
  if (winners.length === 0)
    return "Ninguém bateu a meta ainda — preencha kills e dano. (Se ninguém bater, não tem pra quem mamar.)";
  if (losers.length === 0)
    return "Todo mundo bateu a meta! 🎉 Partida limpa, sem mamadas.";
  const n = losers.length * winners.length;
  return `<b>${losers.map(nome).join(", ")}</b> ${
    losers.length > 1 ? "mamam" : "mama"
  } <b>${winners.map(nome).join(", ")}</b> — ${n} mamada(s).`;
}

// Atualiza preview e os selos ✅/❌ sem re-renderizar tudo (preserva o foco).
function atualizarPreview() {
  const prev = document.getElementById("part-preview");
  if (prev) prev.innerHTML = textoPreview();
  time.forEach((id) => {
    const ok = document.getElementById("ok-" + id);
    if (ok) ok.textContent = bateuMeta(stats[id]) ? "✅" : "❌";
  });
}

export function setStat(id, campo, valor) {
  if (!stats[id]) stats[id] = {};
  stats[id][campo] = valor === "" ? "" : Number(valor);
  atualizarPreview();
}

// A meta nunca muda direto: vira proposta, é decidida por votação dos
// organizadores e executada pelo master. Nem o master altera por aqui.
export async function salvarMeta() {
  const k = Number(document.getElementById("meta-kills").value);
  const d = Number(document.getElementById("meta-damage").value);
  if (!Number.isFinite(k) || !Number.isFinite(d) || k <= 0 || d <= 0) {
    alert("Coloque números válidos pra kills e dano.");
    return;
  }
  if (k === dados.meta.kills && d === dados.meta.damage) {
    alert("Essa já é a meta atual.");
    return;
  }
  const sid = steamIdDoUser(usuarioAtual());
  const eu = dados.players.find((p) => p.steamId === sid);
  try {
    await criarProposta({
      tipo: "meta",
      titulo: `Meta vira ${k} kills e ${d} de dano`,
      detalhe: `Hoje é ${dados.meta.kills} kills e ${dados.meta.damage} de dano.`,
      valor: { kills: k, damage: d },
      autor: { steamId: sid || "", nome: eu ? eu.name : "organizador" },
    });
    alert(
      `Proposta criada. Precisa de ${votosNecessarios()} voto(s) de organizador — votem na aba Assembleia.`
    );
  } catch (e) {
    alert("Não deu pra propor a meta: " + ((e && e.message) || ""));
  }
}

export function setDataPartida(v) {
  dataPartida = v;
}

// ---- Importar partida de JSON ----
function statusJson(msg, cor) {
  const s = document.getElementById("json-status");
  if (s) {
    s.textContent = msg;
    s.style.color = cor;
  }
}
function aplicarJsonPartida(texto) {
  let data;
  try {
    data = JSON.parse(texto);
  } catch {
    return statusJson("JSON inválido.", "var(--coral)");
  }
  // Aceita array puro ou objeto { date?, meta?, players/jogadores/stats: [...] }.
  const arr = Array.isArray(data)
    ? data
    : data.players || data.jogadores || data.stats || [];
  if (!Array.isArray(arr) || !arr.length)
    return statusJson("Não achei a lista de jogadores no JSON.", "var(--coral)");

  const novoTime = [];
  const novoStats = {};
  const naoAchou = [];
  for (const e of arr) {
    const p = acharJogadorPorStat(e);
    if (!p) {
      naoAchou.push(e.name || e.steamId || e.steamid || "?");
      continue;
    }
    if (!novoTime.includes(p.id)) novoTime.push(p.id);
    novoStats[p.id] = {
      kills: Number(e.kills ?? e.frags) || 0,
      damage: Number(e.damage ?? e.dano) || 0,
    };
  }
  if (!novoTime.length)
    return statusJson(
      "Nenhum jogador do JSON bate com os cadastrados. Cadastre-os primeiro.",
      "var(--coral)"
    );

  time = novoTime;
  stats = novoStats;
  if (typeof data.date === "string") dataPartida = data.date;
  if (
    data.meta &&
    Number.isFinite(data.meta.kills) &&
    Number.isFinite(data.meta.damage)
  )
    dados.meta = { kills: data.meta.kills, damage: data.meta.damage };

  renderPartida(); // recria o painel já preenchido
  if (naoAchou.length)
    statusJson(
      `Importados ${novoTime.length}. Não encontrados: ${naoAchou.join(", ")}.`,
      "var(--gold)"
    );
  else
    statusJson(`Importados ${novoTime.length} jogadores. Revise e salve.`, "var(--mint)");
}
export function importarJsonArquivo(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => aplicarJsonPartida(String(r.result));
  r.onerror = () => statusJson("Não deu pra ler o arquivo.", "var(--coral)");
  r.readAsText(f);
}
export function importarJsonTexto() {
  const ta = document.getElementById("ta-json");
  aplicarJsonPartida(ta ? ta.value : "");
}
export function verExemploJson() {
  const ta = document.getElementById("ta-json");
  if (!ta) return;
  ta.value = JSON.stringify(
    {
      date: dataPartida,
      meta: dados.meta,
      players: [
        { name: "Charlinho", kills: 18, damage: 2100 },
        { name: "Iago", kills: 9, damage: 1200 },
      ],
    },
    null,
    2
  );
}

export function addAoTime(id) {
  if (!time.includes(id)) time.push(id);
  if (!stats[id]) stats[id] = { kills: "", damage: "" };
  renderPartida();
}
export function removerDoTime(id) {
  time = time.filter((x) => x !== id);
  delete stats[id];
  renderPartida();
}
export function salvarPartida() {
  if (time.length < 2) {
    alert("Monte o time (mínimo 2 jogadores).");
    return;
  }
  const { winners, losers } = separarTime();
  if (winners.length === 0) {
    if (
      !confirm(
        "Ninguém bateu a meta — não tem pra quem mamar. Salvar mesmo assim (partida sem mamadas)?"
      )
    )
      return;
  } else if (losers.length === 0) {
    if (!confirm("Todo mundo bateu a meta! Salvar partida limpa (sem mamadas)?")) return;
  }
  const entries = [];
  losers.forEach((l) => winners.forEach((w) => entries.push({ from: l, to: w })));
  const statsArr = time.map((id) => ({
    id,
    kills: Number(stats[id] && stats[id].kills) || 0,
    damage: Number(stats[id] && stats[id].damage) || 0,
  }));
  dados.matches.push({
    id: uid(),
    date: dataPartida || new Date().toISOString().slice(0, 10),
    meta: { ...dados.meta },
    stats: statsArr,
    entries,
  });
  salvarPartidas();
  time = [];
  stats = {};
  renderPartida();
  renderHistorico();
  render();
  alert(`Partida salva! ${entries.length} mamada(s) computada(s).`);
  trocarTab("hist");
}

// Puxa kills/dano de um resultado GSI pendente pro jogador e descarta o pendente.
export function usarGsi(key, playerId) {
  const pend = listaPendentes().find((p) => p.key === key);
  if (!pend) return;
  stats[playerId] = { kills: Number(pend.kills) || 0, damage: Number(pend.damage) || 0 };
  descartarGsiPendente(key); // some da lista; o snapshot re-renderiza a partida
}

// ---- Aba GSI (instruções + baixar .cfg + resultados pendentes) ----
export function baixarCfgGsi() {
  baixarCfg();
}
// Copia o texto do .cfg. Alguns navegadores só liberam a Clipboard API em
// HTTPS/contexto seguro — se falhar, seleciona o texto pro Ctrl+C manual.
export async function copiarCfgGsi() {
  const ta = document.getElementById("cfg-txt");
  try {
    await navigator.clipboard.writeText(gerarCfg());
    alert("Texto do .cfg copiado! Cole num arquivo e salve como gamestate_integration_mamometro.cfg");
  } catch {
    if (ta) {
      ta.focus();
      ta.select();
    }
    alert("Não consegui copiar automaticamente. O texto já está selecionado — use Ctrl+C.");
  }
}
export function descartarGsi(key) {
  if (confirm("Descartar esse resultado do GSI?")) descartarGsiPendente(key);
}
export function renderGsi() {
  const el = document.getElementById("pn-gsi");
  if (!el) return;
  const pend = listaPendentes();
  const listaHtml = pend.length
    ? pend
        .map((p) => {
          const dataFmt = p.ts ? new Date(p.ts).toLocaleString("pt-BR") : "";
          return `<div class="chip"><span class="chip-nome">🎮 <b>${escapar(
            p.name
          )}</b> — ${p.kills}k / ${p.damage}d${
            p.map ? ` · ${escapar(p.map)}` : ""
          } <span class="gsi-data">${escapar(dataFmt)}</span></span><button class="x" onclick="descartarGsi('${
            p.key
          }')">×</button></div>`;
        })
        .join("")
    : `<div class="aviso">Nenhum resultado recebido ainda. Depois que alguém jogar com o <code>.cfg</code> instalado, os números aparecem aqui e também na aba <b>Nova partida</b> (botão “usar”).</div>`;

  el.innerHTML = `
    <div class="aviso">
      <b>Automático (GSI):</b> cada jogador instala um arquivo uma vez e o CS2 passa a enviar kills e dano ao fim de cada partida. Só captura as <b>próprias</b> partidas de quem instalou, e só as <b>futuras</b>.
    </div>
    <div class="row-btns">
      <button class="btn gold" onclick="baixarCfgGsi()">Baixar arquivo .cfg</button>
      <button class="btn sec" onclick="copiarCfgGsi()">Copiar o texto</button>
    </div>
    <label>Como instalar</label>
    <ol class="gsi-steps">
      <li>Baixe o arquivo <code>gamestate_integration_mamometro.cfg</code> (botão acima)
          — ou copie o texto abaixo e salve com esse nome exato.</li>
      <li>Coloque em: <code>Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/</code></li>
      <li>Reinicie o CS2. Pronto — ao terminar uma partida, os números chegam aqui.</li>
    </ol>
    <label>Conteúdo do .cfg <span class="hint-inline">(já com a URL deste site)</span></label>
    <textarea class="cfg-txt" id="cfg-txt" readonly rows="12"
      onclick="this.select()">${escapar(gerarCfg())}</textarea>
    <div class="hint">Salve como <code>gamestate_integration_mamometro.cfg</code> — inclusive a extensão <code>.cfg</code>, não <code>.txt</code>.</div>
    <label>Resultados recebidos</label>
    <div class="chip-list">${listaHtml}</div>`;
}

// ---- Aba Ajuda (guia do organizador) ----
export function renderAjudaAdmin() {
  const el = document.getElementById("pn-ajuda");
  if (!el) return;
  el.innerHTML = `
    <div class="guia">
      <h3>Como o Mamômetro funciona</h3>
      <p>Antes de jogar, a galera combina uma <b>meta</b>. Quem <b>não bate</b> a meta
      “mama” quem bateu. O site conta as mamadas e monta o ranking.</p>

      <h3>1) Defina a meta</h3>
      <p>Aba <b>Nova partida</b> → topo. Padrão: <b>15 kills e 1500 de dano</b>.
      Quem atingir <b>kills E dano</b> bateu. Vale pras próximas partidas.</p>

      <h3>2) Lance a partida (3 jeitos)</h3>
      <p><b>a. Na mão:</b> monte o time e digite kills e dano de cada um. O ✅/❌
      mostra quem bateu; o site calcula as mamadas.</p>
      <p><b>b. Por JSON:</b> na caixa “Importar de JSON”, suba um arquivo ou cole o
      texto. Preenche tudo de uma vez. Formato:</p>
      <pre class="guia-code">{
  "date": "2026-07-13",
  "meta": { "kills": 15, "damage": 1500 },
  "players": [
    { "name": "Charlinho", "kills": 18, "damage": 2100 },
    { "steamId": "7656...", "kills": 9, "damage": 1200 }
  ]
}</pre>
      <p>Casa cada um por <b>SteamID</b> ou <b>nome</b>. Também vale um array puro
      <code>[ {…}, {…} ]</code>. Depois de importar, confira e salve.</p>
      <p><b>c. Automático (GSI):</b> aba <b>GSI</b>. Cada jogador instala o <code>.cfg</code>
      uma vez e o CS2 manda kills/dano sozinho ao fim da partida. Aí, na aba
      Nova partida, aparece o botão <b>“usar”</b> pra preencher.</p>

      <h3>3) Jogadores e login</h3>
      <p>Adicione gente na aba <b>Jogadores → Adicionar da Steam</b>. Depois a pessoa
      entra em <b>Entrar → Cadastrar</b> com o mesmo perfil e cria a própria senha —
      cai direto no card certo.</p>

      <div class="aviso" style="margin-top:14px">Organizadores: <b>Vini</b> e <b>Iago</b>.
      Vocês entram com a Steam como qualquer um e ganham o botão “Organizador”.</div>
    </div>`;
}

// ---- Aba Histórico ----
export function renderHistorico() {
  const el = document.getElementById("pn-hist");
  if (!el) return;
  if (dados.matches.length === 0) {
    el.innerHTML = `<div class="aviso">Nenhuma partida registrada ainda.</div>`;
    return;
  }
  const ord = [...dados.matches].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  el.innerHTML = ord
    .map((m) => {
      const pares = (m.entries || [])
        .map((e) => `${escapar(nomeDe(e.from))} → ${escapar(nomeDe(e.to))}`)
        .join("<br>");
      const dataFmt = (m.date || "").split("-").reverse().join("/");
      const meta = m.meta
        ? `<span class="hist-meta">meta ${m.meta.kills}k / ${m.meta.damage}d</span>`
        : "";
      // stats pode ser array [{id,...}] (admin) ou objeto {id:{...}} (envio).
      // Por ora mostramos só kills/dano — os campos extras (KDA, granadas,
      // mapa) são salvos silenciosamente e ainda não exibidos.
      const lista = statsList(m);
      const statsHtml = lista.length
        ? `<div class="hist-stats">` +
          lista
            .map(
              (s) =>
                `<span class="hs">${escapar(nomeDe(s.id))}: ${s.kills}k/${
                  s.damage
                }d ${bateuMeta(s, m.meta || dados.meta) ? "✅" : "❌"}</span>`
            )
            .join("") +
          `</div>`
        : "";
      return `<div class="hist-item"><div class="h"><span class="data">${dataFmt} · ${
        (m.entries || []).length
      } mamada(s) ${meta}</span><button class="btn mini sec" onclick="removerPartida('${
        m.id
      }')">Excluir</button></div>${statsHtml}<div class="pares">${pares}</div></div>`;
    })
    .join("");
}
export function removerPartida(id) {
  if (!confirm("Excluir essa partida? Recalcula o ranking.")) return;
  dados.matches = dados.matches.filter((m) => m.id !== id);
  salvarPartidas();
  renderHistorico();
  render();
}


// ---- Aba Config: papéis e temporadas ----
const ROTULO_PAPEL = { master: "master", organizador: "organizador" };

export function renderConfig() {
  const el = document.getElementById("pn-cfg");
  if (!el) return;
  const papeis = listaPapeis();
  const souMaster = ehMaster();
  const nomeDoSteam = (sid) => {
    const p = dados.players.find((x) => x.steamId === sid);
    return p ? p.name : sid;
  };

  const linhas = Object.keys(papeis)
    .sort((a, b) => (papeis[a] === "master" ? -1 : 1))
    .map((sid) => {
      const papel = papeis[sid];
      const acoes = souMaster
        ? `<button class="btn mini sec" onclick="definirPapel('${sid}','${
            papel === "master" ? "organizador" : "master"
          }')">virar ${papel === "master" ? "organizador" : "master"}</button>
           <button class="btn mini sec" onclick="definirPapel('${sid}','')">remover</button>`
        : "";
      return `<div class="aprov-linha">
        <span class="al-nome">${escapar(nomeDoSteam(sid))}</span>
        <span class="vd ${papel === "master" ? "ok" : "amb"}">${ROTULO_PAPEL[papel] || papel}</span>
        ${acoes}
      </div>`;
    })
    .join("");

  // Só quem já vinculou o card tem SteamID — sem isso não há como promover.
  const candidatos = dados.players.filter((p) => p.steamId && !papeis[p.steamId]);
  const opts = candidatos
    .map((p) => `<option value="${p.id}">${escapar(p.name)}</option>`)
    .join("");

  const seasons = listaSeasons()
    .map((s) => {
      const f = (d) => (d || "").split("-").reverse().join("/");
      return `<div class="chip"><span class="chip-nome">${escapar(s.nome)} · ${f(
        s.inicio
      )} – ${f(s.fim)}${s.fimEstimado ? " (estimado)" : ""}</span></div>`;
    })
    .join("");

  const nVot = votosNecessarios();
  const explicaVoto = temVotantes()
    ? `Promoção por votação precisa de <b>${nVot}</b> voto(s) de organizador.`
    : `Ainda não há organizadores pra votar — só o master consegue promover agora.`;

  el.innerHTML = `
    <div class="aviso">
      <b>master</b>: faz tudo direto, mas <b>não vota</b> na assembleia.<br>
      <b>organizador</b>: aprova partidas e <b>vota</b>.<br>
      <b>comum</b>: envia partida e sugere na assembleia.
    </div>

    <label>Quem tem papel</label>
    <div class="aprov-nums">${linhas || '<div class="aviso">Ninguém ainda.</div>'}</div>

    <label style="margin-top:18px">Dar papel a alguém</label>
    <div class="aviso">${explicaVoto}</div>
    ${
      candidatos.length
        ? `<div style="display:flex;gap:8px;flex-wrap:wrap">
             <select id="prom-jogador" style="flex:1;min-width:150px">${opts}</select>
             ${
               souMaster
                 ? `<button class="btn mini gold" onclick="promoverDireto('organizador')">Organizador</button>
                    <button class="btn mini gold" onclick="promoverDireto('master')">Master</button>`
                 : `<button class="btn mini" onclick="proporAdmin()">Propor votação</button>`
             }
           </div>`
        : `<div class="aviso">Ninguém disponível — só dá pra dar papel a quem já vinculou o card à Steam.</div>`
    }

    <label style="margin-top:22px">Temporadas do CS2</label>
    <div class="aviso">A Valve não publica calendário por API, então as datas vêm das anunciadas por ela. Quando a próxima season for confirmada, adicione aqui.</div>
    <div class="chip-list">${seasons}</div>
    ${
      souMaster
        ? `<label>Adicionar temporada</label>
    <div class="stat-row">
      <span class="sr-nome"><input id="sea-nome" placeholder="Season 6"></span>
      <input id="sea-ini" type="date">
      <input id="sea-fim" type="date">
      <button class="btn mini" onclick="addSeason()">Add</button>
    </div>`
        : `<div class="hint">Só o master edita temporadas.</div>`
    }`;
}

// Master promove/rebaixa direto, sem passar por votação.
export async function definirPapel(steamId, papel) {
  if (!ehMaster()) return alert("Só o master pode mudar papéis.");
  const nome = (dados.players.find((p) => p.steamId === steamId) || {}).name || steamId;
  if (!papel && !confirm(`Remover o papel de ${nome}? Ele volta a ser usuário comum.`)) return;
  try {
    await set(ref(db, "papeis/" + steamId), papel || null);
    renderConfig();
    return true;
  } catch (e) {
    alert("Não deu pra mudar o papel: " + ((e && e.message) || ""));
    return false;
  }
}

export async function promoverDireto(papel) {
  const sel = document.getElementById("prom-jogador");
  if (!sel) return;
  const p = dados.players.find((x) => x.id === sel.value);
  if (!p || !p.steamId) return alert("Escolha alguém que já vinculou o card.");
  // Só avisa sucesso se a gravação passou — antes o erro e o "ok" apareciam juntos.
  const ok = await definirPapel(p.steamId, papel);
  if (ok) alert(`${p.name} agora é ${papel}.`);
}

export function addSeason() {
  const nome = document.getElementById("sea-nome").value.trim();
  const inicio = document.getElementById("sea-ini").value;
  const fim = document.getElementById("sea-fim").value;
  if (!nome || !inicio || !fim) return alert("Preencha nome, início e fim.");
  if (fim < inicio) return alert("O fim tem que ser depois do início.");
  const lista = listaSeasons().slice();
  lista.push({ id: "s" + Date.now().toString(36), nome, inicio, fim });
  lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
  salvarSeasons(lista)
    .then(() => {
      alert("Temporada adicionada.");
      renderConfig();
    })
    .catch((e) => alert("Não deu pra salvar: " + ((e && e.message) || "")));
}
