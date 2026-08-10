// Assembleia: qualquer um sugere meta ou regra o ano todo; os organizadores
// votam em dezembro. Também é onde ficam as propostas de promover organizador
// e de alterar a meta — todas decididas por MAIORIA dos admins.
import { dados, escapar, salvarMeta } from "../state.js";
import {
  usuarioAtual,
  steamIdDoUser,
  ehOrganizador,
  ehMaster,
  papelDe,
} from "../auth.js";
import { db } from "../firebase.js";
import { ref, set } from "firebase/database";
import { abrirOverlay, fecharOverlay } from "./overlay.js";
import {
  TIPOS,
  listaPropostas,
  criarProposta,
  votar,
  marcarStatus,
  marcarAplicada,
  aguardandoMaster,
  votosNecessarios,
  contarVotos,
  temMaioria,
  assembleiaAberta,
  diasParaAssembleia,
} from "../propostas.js";

const meuSteamId = () => steamIdDoUser(usuarioAtual());
function meuNome() {
  const p = dados.players.find((x) => x.steamId === meuSteamId());
  return p ? p.name : "jogador";
}

export function fecharAssembleia() {
  fecharOverlay();
}

// ---- Tela aberta a todos: enviar sugestão + acompanhar votação ----
export function abrirAssembleia() {
  if (!usuarioAtual()) return alert("Entre com sua conta pra participar.");
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharAssembleia()">×</button>
    <h2>Assembleia</h2>
    <div class="sub">Sugira uma meta ou regra. Os organizadores votam em dezembro.</div>
    <div id="pn-assemb"></div>`;
  renderAssembleia();
  abrirOverlay();
}

export function renderAssembleia() {
  const el = document.getElementById("pn-assemb");
  if (!el) return;

  const aberta = assembleiaAberta();
  const dias = diasParaAssembleia();
  const janela = aberta
    ? `<div class="aviso ok-aviso">🗳️ <b>Votação aberta</b> — os organizadores decidem até 31/12.</div>`
    : `<div class="aviso">As sugestões ficam guardadas até <b>1º de dezembro</b>, quando a votação abre sozinha. Faltam <b>${dias}</b> dias.</div>`;

  const props = listaPropostas();
  const lista = props.length
    ? props.map((p) => cardProposta(p, aberta)).join("")
    : `<div class="aviso">Nenhuma proposta ainda. Seja o primeiro.</div>`;

  el.innerHTML = `
    ${janela}
    <label>Sua sugestão</label>
    <select id="as-tipo">
      <option value="regra">Regra nova</option>
      <option value="meta">Mudar a meta</option>
    </select>
    <input id="as-titulo" placeholder="Resumo (ex.: meta vira 18 kills)" maxlength="80">
    <textarea class="cfg-txt" id="as-detalhe" rows="3" placeholder="Explique a ideia — por que ficaria melhor assim?"></textarea>
    <div id="as-meta-campos" style="display:none">
      <div class="stat-row">
        <span class="sr-nome">Meta proposta</span>
        <input type="number" id="as-kills" placeholder="kills" min="0">
        <input type="number" id="as-damage" placeholder="dano" min="0">
      </div>
    </div>
    <div class="erro" id="as-erro"></div>
    <div class="row-btns"><button class="btn" onclick="enviarSugestao()">Enviar sugestão</button></div>
    <label style="margin-top:22px">Propostas</label>
    ${lista}`;

  const sel = document.getElementById("as-tipo");
  const campos = document.getElementById("as-meta-campos");
  sel.onchange = () => (campos.style.display = sel.value === "meta" ? "" : "none");
}

function cardProposta(p, janelaAberta) {
  const { sim, nao } = contarVotos(p);
  const precisa = votosNecessarios();
  const status = p.status || "aberta";
  const meu = (p.votos || {})[meuSteamId()];
  const fechada = status !== "aberta";

  const pendente = aguardandoMaster(p);
  const selo = fechada
    ? status === "aprovada"
      ? pendente
        ? `<span class="vd amb">aprovada — aguardando master aplicar</span>`
        : `<span class="vd ok">aplicada</span>`
      : `<span class="vd dif">recusada</span>`
    : `<span class="vd amb">${sim}/${precisa} votos</span>`;

  // Só ORGANIZADOR vota. Master é excluído de propósito — ele decide direto.
  // Pauta de assembleia (meta e regra) só é votada em dezembro. Promoção é
  // operacional e não espera — e o master resolve qualquer uma a qualquer hora.
  const naJanela = p.tipo === "admin" || janelaAberta;
  const podeVotar = ehOrganizador() && !fechada && naJanela;

  let botoes = "";
  if (podeVotar) {
    botoes = `<div class="row-btns">
        <button class="btn mini ${meu === true ? "gold" : "sec"}" onclick="votarProposta('${p.key}',true)">A favor${
          meu === true ? " ✓" : ""
        }</button>
        <button class="btn mini ${meu === false ? "gold" : "sec"}" onclick="votarProposta('${p.key}',false)">Contra${
          meu === false ? " ✓" : ""
        }</button>
      </div>`;
  } else if (ehOrganizador() && !fechada) {
    botoes = `<div class="hint">Pauta de assembleia: a votação abre em dezembro.</div>`;
  } else if (ehMaster() && !fechada) {
    // Master não vota, mas destrava o que a votação não conseguiu fechar.
    const faltam = Math.max(0, precisa - sim);
    botoes = `<div class="hint">Você é master: não vota, mas pode decidir direto.${
      precisa
        ? faltam
          ? ` A votação está em <b>${sim}/${precisa}</b> — faltam ${faltam}.`
          : " A votação já tem maioria."
        : " Ainda não há organizadores pra votar."
    }</div>
      <div class="row-btns">
        <button class="btn mini gold" onclick="decidirMaster('${p.key}',true)">Aprovar direto</button>
        <button class="btn mini sec" onclick="decidirMaster('${p.key}',false)">Recusar direto</button>
      </div>`;
  }

  // Aprovada pela votação: só falta o master executar o efeito.
  if (pendente && ehMaster()) {
    botoes += `<div class="row-btns"><button class="btn mini gold" onclick="aplicarProposta('${p.key}')">Aplicar agora</button></div>`;
  } else if (pendente) {
    botoes += `<div class="hint">Aprovada pela votação. Um master precisa aplicar.</div>`;
  }

  const detalheValor =
    p.tipo === "meta" && p.valor
      ? `<div class="al-num">${p.valor.kills} kills / ${p.valor.damage} dano</div>`
      : p.tipo === "admin" && p.valor
        ? `<div class="al-num">promover <b>${escapar(p.valor.nome || "")}</b></div>`
        : "";

  return `<div class="aprov-item">
    <div class="ai-topo">
      <div><b>${escapar(p.titulo || TIPOS[p.tipo] || "Proposta")}</b>
        <span class="ai-tag">${TIPOS[p.tipo] || p.tipo}</span> ${selo}</div>
      <div class="ai-autor">por ${escapar((p.autor && p.autor.nome) || "?")} · ${
        sim
      } a favor, ${nao} contra</div>
    </div>
    ${detalheValor}
    ${p.detalhe ? `<div class="ai-det">${escapar(p.detalhe)}</div>` : ""}
    ${botoes}
  </div>`;
}

export async function enviarSugestao() {
  const erro = document.getElementById("as-erro");
  erro.textContent = "";
  const tipo = document.getElementById("as-tipo").value;
  const titulo = document.getElementById("as-titulo").value.trim();
  const detalhe = document.getElementById("as-detalhe").value.trim();
  if (!titulo) return (erro.textContent = "Escreva um resumo da sugestão.");

  let valor = null;
  if (tipo === "meta") {
    const k = Number(document.getElementById("as-kills").value);
    const d = Number(document.getElementById("as-damage").value);
    if (!Number.isFinite(k) || !Number.isFinite(d) || k <= 0 || d <= 0)
      return (erro.textContent = "Preencha kills e dano da meta proposta.");
    valor = { kills: k, damage: d };
  }
  try {
    await criarProposta({
      tipo,
      titulo,
      detalhe,
      valor,
      autor: { steamId: meuSteamId() || "", nome: meuNome() },
    });
    alert("Sugestão enviada! Ela entra na pauta da assembleia.");
    renderAssembleia();
  } catch (e) {
    erro.textContent = (e && e.message) || "Não deu pra enviar.";
  }
}

// ---- Voto (só admin) ----
export async function votarProposta(key, sim) {
  const sid = meuSteamId();
  if (!sid) return;
  try {
    await votar(key, sid, sim);
    // Bateu a maioria? Aplica na hora e fecha.
    const p = listaPropostas().find((x) => x.key === key);
    if (!p) return renderAssembleia();
    const atual = { ...p, votos: { ...(p.votos || {}), [sid]: sim } };
    if (temMaioria(atual)) {
      await marcarStatus(key, "aprovada");
      // Promoção a organizador a maioria já aplica sozinha. Meta e regra
      // continuam com o master, que é quem tem permissão de gravá-las.
      if (p.tipo === "admin") {
        await aplicar(atual);
        alert(
          `Maioria atingida! ${(p.valor && p.valor.nome) || "O jogador"} já é organizador.`
        );
      } else {
        alert("Maioria atingida! A proposta foi aprovada — um master vai aplicar.");
      }
    }
    renderAssembleia();
  } catch (e) {
    alert(
      "Não deu pra votar. Confira se seu SteamID está como organizador no nó `papeis`.\n\n" +
        ((e && e.message) || "")
    );
  }
}

// Executa o efeito da proposta. SÓ MASTER — é ele quem tem permissão de
// gravar meta e papéis.
async function aplicar(p) {
  const quem = { steamId: meuSteamId() || "", nome: meuNome() };
  if (p.tipo === "meta" && p.valor) {
    dados.meta = { kills: p.valor.kills, damage: p.valor.damage };
    await salvarMeta();
  }
  if (p.tipo === "admin" && p.valor && p.valor.steamId) {
    await set(ref(db, "papeis/" + p.valor.steamId), "organizador");
  }
  // Regra é decisão combinada, não muda nada no sistema — fica registrada.
  await marcarStatus(p.key, "aprovada");
  await marcarAplicada(p.key, quem);
}

// ---- Painel do organizador: propor promoção ----
export async function proporAdmin() {
  const inp = document.getElementById("prom-jogador");
  if (!inp) return;
  const pid = inp.value;
  const p = dados.players.find((x) => x.id === pid);
  if (!p) return alert("Escolha um jogador.");
  if (!p.steamId)
    return alert(
      `${p.name} ainda não vinculou o card à conta da Steam — sem SteamID não dá pra promover.`
    );
  if (papelDe(p.steamId)) return alert(`${p.name} já tem papel: ${papelDe(p.steamId)}.`);
  try {
    await criarProposta({
      tipo: "admin",
      titulo: `Promover ${p.name} a organizador`,
      detalhe: "",
      valor: { steamId: p.steamId, nome: p.name },
      autor: { steamId: meuSteamId() || "", nome: meuNome() },
    });
    alert(
      `Proposta criada. Precisa de ${votosNecessarios()} voto(s) de organizador pra valer — vote na aba Assembleia.`
    );
  } catch (e) {
    alert("Não deu pra propor: " + ((e && e.message) || ""));
  }
}

// ---- Master: decide sem votar ----
export async function decidirMaster(key, aprovar) {
  const p = listaPropostas().find((x) => x.key === key);
  if (!p) return;
  const rotulo = aprovar ? "APROVAR" : "RECUSAR";
  if (!confirm(`${rotulo} esta proposta direto, sem votação?\n\n"${p.titulo}"`)) return;
  try {
    if (aprovar) await aplicar(p);
    else await marcarStatus(key, "recusada");
    renderAssembleia();
  } catch (e) {
    alert("Não deu pra decidir: " + ((e && e.message) || ""));
  }
}

// Master executa o efeito de uma proposta já aprovada pela votação.
export async function aplicarProposta(key) {
  if (!ehMaster()) return alert("Só o master aplica o efeito de uma proposta.");
  const p = listaPropostas().find((x) => x.key === key);
  if (!p) return;
  try {
    await aplicar(p);
    renderAssembleia();
    alert("Proposta aplicada.");
  } catch (e) {
    alert("Não deu pra aplicar: " + ((e && e.message) || ""));
  }
}
