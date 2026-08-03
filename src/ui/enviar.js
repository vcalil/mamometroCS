// Tela "Enviar partida" — aberta a QUALQUER pessoa com conta.
// O envio não entra no ranking direto: vai pra fila e um organizador aprova.
import {
  dados,
  escapar,
  bateuMeta,
  acharJogadorPorStat,
} from "../state.js";
import { usuarioAtual, steamIdDoUser } from "../auth.js";
import { enviarSubmissao } from "../submissoes.js";
import { validar } from "../leetify.js";
import { pendentePara } from "../gsi-client.js";
import { lerDemo } from "../demo.js";

let time = [];
let stats = {}; // { playerId: { kills, damage } }
let dataPartida = new Date().toISOString().slice(0, 10);
let origem = "manual";

// Estado da leitura por demo (aba "Por demo"). Cada jogador lido guarda nome,
// SteamID, kills e dano exatos, e o vínculo com um jogador do elenco.
let dem = { players: [], ocupado: false };
let mapaPartida = ""; // mapa lido da demo (só o caminho "Por demo" preenche)

const nomeDoJogador = (id) => (dados.players.find((p) => p.id === id) || {}).name || "—";
const avImg = (url) =>
  url ? `<img class="av" src="${escapar(url)}" alt="" loading="lazy">` : "";

function abrir() {
  document.getElementById("overlay").classList.add("on");
}
export function fecharEnviar() {
  document.getElementById("overlay").classList.remove("on");
}

export function abrirEnviar() {
  if (!usuarioAtual()) {
    alert("Entre com sua conta pra enviar uma partida.");
    return;
  }
  time = [];
  stats = {};
  origem = "manual";
  dem = { players: [], ocupado: false };
  mapaPartida = "";
  dataPartida = new Date().toISOString().slice(0, 10);
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharEnviar()">×</button>
    <h2>Enviar partida</h2>
    <div class="sub">Qualquer um pode enviar. Um organizador confere e aprova antes de entrar no ranking.</div>
    <div class="tabs">
      <div class="tab ativa" data-t="env-form" onclick="trocarTabEnviar('env-form')">Partida</div>
      <div class="tab" data-t="env-dem" onclick="trocarTabEnviar('env-dem')">Por demo</div>
      <div class="tab" data-t="env-json" onclick="trocarTabEnviar('env-json')">Por JSON</div>
      <div class="tab" data-t="env-ajuda" onclick="trocarTabEnviar('env-ajuda')">Como funciona</div>
    </div>
    <div class="painel ativo" id="pn-env-form"></div>
    <div class="painel" id="pn-env-dem"></div>
    <div class="painel" id="pn-env-json"></div>
    <div class="painel" id="pn-env-ajuda"></div>`;
  renderFormEnviar();
  renderDemoEnviar();
  renderJsonEnviar();
  renderAjudaEnviar();
  abrir();
}

export function trocarTabEnviar(t) {
  document
    .querySelectorAll(".tabs .tab")
    .forEach((x) => x.classList.toggle("ativa", x.dataset.t === t));
  document
    .querySelectorAll(".painel")
    .forEach((x) => x.classList.remove("ativo"));
  document.getElementById("pn-" + t).classList.add("ativo");
}

// ---- Aba Partida (montar time + números) ----
export function renderFormEnviar() {
  const el = document.getElementById("pn-env-form");
  if (!el) return;
  if (dados.players.length < 2) {
    el.innerHTML = `<div class="aviso">É preciso ter pelo menos 2 jogadores cadastrados.</div>`;
    return;
  }
  const disp = dados.players.filter((p) => !time.includes(p.id));
  const noTime = time.map((id) => dados.players.find((p) => p.id === id)).filter(Boolean);

  const dispHtml = disp.length
    ? disp
        .map(
          (p) =>
            `<button class="tchip" onclick="addAoTimeEnv('${p.id}')">${avImg(
              p.avatar
            )}${escapar(p.name)}<span>＋</span></button>`
        )
        .join("")
    : `<div class="tvazio">todos já no time</div>`;

  let linhas = "";
  if (noTime.length) {
    linhas = noTime
      .map((p) => {
        const s = stats[p.id] || {};
        const bateu = bateuMeta(s);
        const gsi = p.steamId ? pendentePara(p.steamId) : null;
        const btnGsi = gsi
          ? `<button class="btn mini sec" onclick="usarGsiEnv('${p.id}')" title="Usar os números que o CS2 enviou">usar ${gsi.kills}k/${gsi.damage}d</button>`
          : "";
        return `<div class="stat-row ${bateu ? "ok" : ""}">
          <span class="sr-nome">${avImg(p.avatar)}${escapar(p.name)}</span>
          <input type="number" min="0" placeholder="kills" value="${
            s.kills ?? ""
          }" oninput="setStatEnv('${p.id}','kills',this.value)">
          <input type="number" min="0" placeholder="dano" value="${
            s.damage ?? ""
          }" oninput="setStatEnv('${p.id}','damage',this.value)">
          <span class="sr-flag">${bateu ? "✅" : "❌"}</span>
          <button class="x" onclick="removerDoTimeEnv('${p.id}')">×</button>
          ${btnGsi}
        </div>`;
      })
      .join("");
  }

  const { winners, losers } = separar();
  const preview =
    time.length >= 2
      ? losers.length === 0
        ? `<div class="preview">Todo mundo bateu a meta — nenhuma mamada.</div>`
        : winners.length === 0
        ? `<div class="preview">Ninguém bateu a meta — não sobra pra quem mamar 😅</div>`
        : `<div class="preview"><b>${losers
            .map((id) => escapar(nomeDoJogador(id)))
            .join(", ")}</b> ${losers.length > 1 ? "mamam" : "mama"} <b>${winners
            .map((id) => escapar(nomeDoJogador(id)))
            .join(", ")}</b> — ${losers.length * winners.length} mamada(s).</div>`
      : "";

  el.innerHTML = `
    <div class="aviso">Meta atual: <b>${dados.meta.kills}</b> kills e <b>${dados.meta.damage}</b> de dano. Quem não bater, mama quem bateu.</div>
    <label>Data da partida</label>
    <input type="date" id="env-data" value="${dataPartida}" onchange="setDataEnv(this.value)">
    <label>Quem jogou?</label>
    <div class="tcol" style="min-height:auto">${dispHtml}</div>
    ${linhas ? `<label>Números de cada um</label><div class="stat-list">${linhas}</div>` : ""}
    ${preview}
    <div class="erro" id="env-erro"></div>
    <div class="row-btns">
      <button class="btn gold" id="env-btn" onclick="confirmarEnvio()">Enviar pra aprovação</button>
    </div>`;
}

function separar() {
  return {
    winners: time.filter((id) => bateuMeta(stats[id])),
    losers: time.filter((id) => !bateuMeta(stats[id])),
  };
}

export function addAoTimeEnv(id) {
  if (!time.includes(id)) time.push(id);
  renderFormEnviar();
}
export function removerDoTimeEnv(id) {
  time = time.filter((x) => x !== id);
  delete stats[id];
  renderFormEnviar();
}
export function setStatEnv(id, campo, valor) {
  stats[id] = stats[id] || {};
  stats[id][campo] = valor === "" ? undefined : Number(valor);
  // Só re-renderiza o ✅/❌ da linha, pra não perder o foco do input.
  const linha = document.querySelectorAll(".stat-row")[time.indexOf(id)];
  if (linha) {
    const ok = bateuMeta(stats[id]);
    linha.classList.toggle("ok", ok);
    const flag = linha.querySelector(".sr-flag");
    if (flag) flag.textContent = ok ? "✅" : "❌";
  }
}
export function setDataEnv(v) {
  dataPartida = v;
}
export function usarGsiEnv(id) {
  const p = dados.players.find((x) => x.id === id);
  const g = p && p.steamId ? pendentePara(p.steamId) : null;
  if (!g) return;
  stats[id] = { kills: g.kills, damage: g.damage };
  origem = "gsi";
  renderFormEnviar();
}

// ---- Envio ----
export async function confirmarEnvio() {
  const erro = document.getElementById("env-erro");
  const btn = document.getElementById("env-btn");
  erro.textContent = "";
  if (time.length < 2) return (erro.textContent = "Monte o time (mínimo 2 jogadores).");
  const faltando = time.filter((id) => {
    const s = stats[id] || {};
    return !Number.isFinite(s.kills) || !Number.isFinite(s.damage);
  });
  if (faltando.length)
    return (erro.textContent = `Faltam os números de: ${faltando
      .map(nomeDoJogador)
      .join(", ")}`);

  const { winners, losers } = separar();
  const entries = [];
  losers.forEach((l) => winners.forEach((w) => entries.push({ from: l, to: w })));

  btn.disabled = true;
  btn.textContent = "Validando no Leetify...";

  // Validação é um extra: se falhar ou demorar, o envio segue mesmo assim.
  let validacao = null;
  try {
    const paraValidar = time.map((id) => {
      const p = dados.players.find((x) => x.id === id) || {};
      return { steamId: p.steamId, name: p.name, kills: (stats[id] || {}).kills };
    });
    validacao = await validar(paraValidar, dataPartida);
  } catch {
    validacao = null;
  }

  const user = usuarioAtual();
  const sid = steamIdDoUser(user);
  const eu = dados.players.find((p) => p.steamId === sid);

  const statsPorJogador = {};
  time.forEach((id) => (statsPorJogador[id] = stats[id]));

  try {
    btn.textContent = "Enviando...";
    await enviarSubmissao({
      date: dataPartida,
      entries,
      stats: statsPorJogador,
      map: mapaPartida || null,
      autor: { steamId: sid || "", nome: eu ? eu.name : "jogador" },
      origem,
      validacao,
    });
    fecharEnviar();
    alert("Partida enviada! Um organizador vai conferir e aprovar.");
  } catch (e) {
    erro.textContent = (e && e.message) || "Não deu pra enviar. Tente de novo.";
    btn.disabled = false;
    btn.textContent = "Enviar pra aprovação";
  }
}

// ---- Aba JSON ----
export function renderJsonEnviar() {
  const el = document.getElementById("pn-env-json");
  if (!el) return;
  el.innerHTML = `
    <div class="aviso">Cole o JSON com os números da partida. Ele preenche o formulário da aba <b>Partida</b> — você confere antes de enviar.</div>
    <label>Arquivo</label>
    <input type="file" accept=".json,application/json" onchange="importarJsonEnv(this)">
    <label>Ou cole aqui</label>
    <textarea class="cfg-txt" id="env-json-txt" rows="8" placeholder='{"date":"2026-07-20","players":[{"name":"Fire","kills":18,"damage":2100}]}'></textarea>
    <div class="erro" id="env-json-erro"></div>
    <div class="row-btns"><button class="btn sec" onclick="aplicarJsonEnv()">Preencher formulário</button></div>`;
}

export function importarJsonEnv(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    document.getElementById("env-json-txt").value = fr.result;
    aplicarJsonEnv();
  };
  fr.readAsText(f);
}

export function aplicarJsonEnv() {
  const erro = document.getElementById("env-json-erro");
  erro.textContent = "";
  let j;
  try {
    j = JSON.parse(document.getElementById("env-json-txt").value);
  } catch {
    return (erro.textContent = "JSON inválido — confira as vírgulas e as aspas.");
  }
  const lista = j.players || j.jogadores || [];
  if (!Array.isArray(lista) || !lista.length)
    return (erro.textContent = 'O JSON precisa de uma lista "players".');

  if (j.date) dataPartida = j.date;
  mapaPartida = j.map || j.mapa || "";
  const naoAchou = [];
  lista.forEach((e) => {
    const p = acharJogadorPorStat(e);
    if (!p) return naoAchou.push(e.name || e.steamId || "?");
    if (!time.includes(p.id)) time.push(p.id);
    const s = {
      kills: Number(e.kills) || 0,
      damage: Number(e.damage ?? e.dano) || 0,
    };
    // Campos extras (KDA, granadas) se o JSON trouxer (ex.: gerado pelo CLI).
    CAMPOS_EXTRA.forEach((k) => {
      if (Number.isFinite(Number(e[k]))) s[k] = Number(e[k]);
    });
    stats[p.id] = s;
  });
  origem = "json";
  renderFormEnviar();
  trocarTabEnviar("env-form");
  if (naoAchou.length)
    alert(`Não encontrei no elenco: ${naoAchou.join(", ")}. Confira os nomes.`);
}

// Preenche o formulário da aba Partida a partir de uma lista já vinculada a
// jogadores do elenco: [{ playerId, kills, damage }]. Usado pela leitura de
// imagem (a aba JSON casa por nome e tem seu próprio caminho).
// Campos extras (KDA, granadas) que a demo traz e a gente guarda junto do
// stat de cada jogador — não afetam a meta, são informativos.
const CAMPOS_EXTRA = [
  "deaths",
  "assists",
  "utilityDamage",
  "flashAssists",
  "enemiesFlashed",
  "hsKills",
  "mvps",
];

function preencherStats(itens, date) {
  if (date) dataPartida = date;
  itens.forEach((it) => {
    const { playerId, kills, damage } = it;
    if (!playerId) return;
    if (!time.includes(playerId)) time.push(playerId);
    const s = {
      kills: Number.isFinite(Number(kills)) ? Number(kills) : undefined,
      damage: Number.isFinite(Number(damage)) ? Number(damage) : undefined,
    };
    CAMPOS_EXTRA.forEach((k) => {
      if (Number.isFinite(Number(it[k]))) s[k] = Number(it[k]);
    });
    stats[playerId] = s;
  });
  renderFormEnviar();
  trocarTabEnviar("env-form");
}

// ---- Aba Por demo (parser do .dem no navegador) ----
export function renderDemoEnviar() {
  const el = document.getElementById("pn-env-dem");
  if (!el) return;
  const tem = dem.players.length > 0;
  el.innerHTML = `
    <div class="aviso">Suba a <b>demo (.dem)</b> de uma partida — baixe pelo CS2 em
    <b>Assistir → suas partidas → Baixar</b>. O site lê os números <b>exatos</b> do
    placar (kills e dano de todos) aqui no seu navegador; o arquivo <b>não sobe</b> pra
    lugar nenhum. Nada entra no ranking sem um organizador aprovar.</div>
    <label>Arquivo .dem</label>
    <input type="file" accept=".dem" id="dem-file" onchange="demArquivo(this)">
    <div id="dem-status" class="ocr-status"></div>
    <div id="dem-grid">${tem ? gridDemo() : ""}</div>`;
}

// Grade dos jogadores lidos da demo. Os do elenco já vêm casados pelo SteamID
// (exato); adversários ficam em "ignorar". Números vêm exatos, mas dá pra editar.
function gridDemo() {
  const players = dados.players;
  const linhas = dem.players
    .map((l, i) => {
      const opts =
        `<option value="">— ignorar (adversário) —</option>` +
        players
          .map(
            (p) =>
              `<option value="${p.id}" ${
                l.playerId === p.id ? "selected" : ""
              }>${escapar(p.name)}</option>`
          )
          .join("");
      const kda = `${l.kills}/${l.deaths ?? 0}/${l.assists ?? 0}`;
      const flash = l.flashAssists ? ` · 🔦${l.flashAssists}` : "";
      return `<div class="ocr-row ${l.playerId ? "" : "off"}">
        <div class="ocr-lida" title="SteamID ${escapar(l.steamId)}">${escapar(
        l.nome
      )} <small>${kda} · ${l.damage} dano${flash}</small></div>
        <select class="ocr-bind" onchange="demBind(${i},this.value)">${opts}</select>
        <input type="number" min="0" class="ocr-k" value="${
          l.kills ?? ""
        }" placeholder="k" oninput="demEditNum(${i},'kills',this.value)">
        <input type="number" min="0" class="ocr-d" value="${
          l.damage ?? ""
        }" placeholder="dano" oninput="demEditNum(${i},'damage',this.value)">
      </div>`;
    })
    .join("");

  const nBind = dem.players.filter((l) => l.playerId).length;
  return `<div class="ocr-list">${linhas}</div>
    <div class="hint">Os jogadores do elenco já vêm marcados pelo SteamID. Linhas em "ignorar" (adversários) não entram.</div>
    <div class="row-btns">
      <button class="btn gold" onclick="demAplicar()" ${
        nBind ? "" : "disabled"
      }>Preencher formulário (${nBind})</button>
    </div>`;
}

export async function demArquivo(input) {
  const f = input.files && input.files[0];
  if (!f || dem.ocupado) return;
  const status = document.getElementById("dem-status");
  dem.ocupado = true;
  dem.players = [];
  document.getElementById("dem-grid").innerHTML = "";
  const pintar = (msg) => {
    if (status) status.textContent = msg;
  };
  // Data provável da partida = data do arquivo (a pessoa ajusta no formulário).
  if (f.lastModified) dataPartida = new Date(f.lastModified).toISOString().slice(0, 10);
  try {
    const { players, map } = await lerDemo(f, pintar);
    mapaPartida = map || "";
    dem.players = players.map((p) => {
      const jog = acharJogadorPorStat(p); // casa por SteamID (exato) ou nome
      return {
        nome: p.name,
        steamId: p.steamId,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        damage: p.damage,
        utilityDamage: p.utilityDamage,
        flashAssists: p.flashAssists,
        enemiesFlashed: p.enemiesFlashed,
        hsKills: p.hsKills,
        mvps: p.mvps,
        playerId: jog ? jog.id : "",
      };
    });
    const nBind = dem.players.filter((l) => l.playerId).length;
    pintar(
      `Li ${players.length} jogadores${
        map ? ` em ${map}` : ""
      } — ${nBind} do elenco reconhecidos. Confira e preencha.`
    );
    document.getElementById("dem-grid").innerHTML = gridDemo();
  } catch (e) {
    pintar((e && e.message) || "Falhou ao ler a demo. Tente outra ou use a aba Partida na mão.");
  } finally {
    dem.ocupado = false;
  }
}

export function demBind(i, playerId) {
  if (dem.players[i]) dem.players[i].playerId = playerId || "";
  document.getElementById("dem-grid").innerHTML = gridDemo();
}

export function demEditNum(i, campo, val) {
  if (!dem.players[i]) return;
  dem.players[i][campo === "kills" ? "kills" : "damage"] =
    val === "" ? undefined : Number(val);
}

export function demAplicar() {
  const itens = dem.players
    .filter((l) => l.playerId)
    .map((l) => ({
      playerId: l.playerId,
      kills: l.kills,
      damage: l.damage,
      deaths: l.deaths,
      assists: l.assists,
      utilityDamage: l.utilityDamage,
      flashAssists: l.flashAssists,
      enemiesFlashed: l.enemiesFlashed,
      hsKills: l.hsKills,
      mvps: l.mvps,
    }));
  if (!itens.length) return;
  origem = "demo";
  preencherStats(itens, dataPartida);
}

// ---- Aba Como funciona ----
export function renderAjudaEnviar() {
  const el = document.getElementById("pn-env-ajuda");
  if (!el) return;
  el.innerHTML = `
    <div class="guia">
      <h3>Como a partida entra no ranking</h3>
      <p>Você envia → cai numa fila → um <b>organizador aprova</b> → vira mamada no
      ranking. Fica registrado quem enviou e quem aprovou.</p>

      <h3>1) Na mão (o mais simples)</h3>
      <p>Na aba <b>Partida</b>: escolha a data, toque nos nomes de quem jogou e
      digite <b>kills</b> e <b>dano</b> de cada um. O ✅/❌ mostra na hora quem bateu
      a meta de <b>${dados.meta.kills} kills e ${dados.meta.damage} de dano</b>.
      Os números aparecem no placar no fim da partida (tab de scoreboard).</p>

      <h3>2) Por demo (.dem) — o mais preciso</h3>
      <p>Na aba <b>Por demo</b>, suba a <b>demo da partida</b> (no CS2: <b>Assistir →
      suas partidas → Baixar</b>). O site lê os números <b>exatos</b> do placar —
      kills e dano de <b>todos</b>, a partir de <b>uma pessoa só</b> — e já casa cada
      um com o elenco pelo SteamID. A leitura roda no seu navegador: o arquivo
      <b>não sobe</b> pra lugar nenhum. Adversários entram como "ignorar". Basta
      um do grupo subir a demo de cada partida.</p>

      <h3>3) Por JSON (vários de uma vez)</h3>
      <p>Na aba <b>Por JSON</b>, suba um arquivo ou cole o texto. Serve quando
      alguém já anotou tudo. Formato:</p>
      <pre class="guia-code">{
  "date": "2026-07-20",
  "players": [
    { "name": "Fire",  "kills": 18, "damage": 2100 },
    { "name": "Xande", "kills": 9,  "damage": 1200 }
  ]
}</pre>
      <p>O <code>name</code> tem que bater com o nome no elenco (maiúsculas não
      importam). Se você tiver o <code>steamId</code>, pode usar ele no lugar —
      é mais seguro contra apelido trocado.</p>

      <h3>4) Automático pelo CS2 (.cfg)</h3>
      <p>É o jeito que não dá trabalho: você instala <b>uma vez</b> um arquivo na
      pasta do CS2 e, ao fim de cada partida, o jogo manda suas kills e dano
      sozinho. Aí é só clicar em <b>“usar”</b> ao lado do seu nome.</p>
      <p>O arquivo e o passo a passo estão com o organizador (painel →
      aba <b>GSI</b>), que pode mandar no grupo. Ele só captura as <b>suas</b>
      partidas e só as <b>futuras</b> — não vale pro que já passou.</p>

      <h3>Conferência automática</h3>
      <p>Ao enviar, o site consulta o <b>Leetify</b> e compara as <b>kills</b> que
      você digitou com o histórico público de quem tem perfil por lá. O resultado
      aparece pro organizador como uma segunda opinião. O <b>dano</b> não é
      público no Leetify, então esse continua na confiança.</p>
    </div>`;
}
