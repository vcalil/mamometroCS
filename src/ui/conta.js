import { dados, salvar, uid, escapar } from "../state.js";
import { configurado } from "../firebase.js";
import {
  cadastrar,
  entrar,
  sair,
  usuarioAtual,
  authPronto,
  ehAdmin,
  steamIdDoUser,
  msgErroAuth,
  SENHA_MIN,
} from "../auth.js";
import { render } from "./render.js";

let perfilPendente = null; // perfil da Steam resolvido, aguardando vínculo

function avImg(url, cls = "av") {
  return url ? `<img class="${cls}" src="${escapar(url)}" alt="" loading="lazy">` : "";
}
function abrir() {
  document.getElementById("overlay").classList.add("on");
}
function fechar() {
  document.getElementById("overlay").classList.remove("on");
}
const jogadorPorSteam = (sid) => dados.players.find((p) => p.steamId === sid);

// ---- Início: escuta mudanças de login ----
// (O bootstrap em main.js assina a auth diretamente, pra amarrar os listeners
// do banco ao login — as regras exigem sessão pra ler.)

// Controla a tela: só mostra o ranking se estiver logado; senão, muro de login.
export function renderApp() {
  if (!configurado) return;
  const resumo = document.querySelector(".resumo");
  renderConta();

  // Enquanto o Firebase não resolve a sessão, evita piscar o login.
  if (!authPronto()) {
    if (resumo) resumo.style.display = "none";
    const c = document.getElementById("conteudo");
    if (c) c.innerHTML = `<div class="vazio">Carregando...</div>`;
    return;
  }

  if (usuarioAtual()) {
    if (resumo) resumo.style.display = "";
    render(); // ranking
  } else {
    if (resumo) resumo.style.display = "none";
    // Só (re)constrói o muro se ele ainda não está na tela — assim uma
    // atualização de dados ao vivo não apaga o que a pessoa está digitando.
    if (!document.querySelector("#conteudo .gate")) renderLoginGate();
  }
}

// Cabeçalho: só mostra chip/Organizador quando logado (o muro cuida do login).
export function renderConta() {
  const el = document.getElementById("conta");
  if (!el) return;
  const user = configurado ? usuarioAtual() : null;
  if (user) {
    const p = jogadorPorSteam(steamIdDoUser(user));
    const nome = p ? p.name : "jogador";
    const orgBtn = ehAdmin()
      ? `<button class="btn-org" onclick="abrirAdmin()">Organizador</button>`
      : "";
    el.innerHTML = `${orgBtn}<span class="conta-logado">${avImg(
      p && p.avatar
    )}<span class="cn">${escapar(nome)}</span><button class="conta-sair" onclick="sairConta()">sair</button></span>`;
  } else {
    el.innerHTML = "";
  }
}

// Muro de login/cadastro renderizado no lugar do ranking.
function renderLoginGate() {
  const el = document.getElementById("conteudo");
  if (!el) return;
  el.innerHTML = `
    <div class="gate">
      <h2 class="gate-h">Entre pra ver o ranking</h2>
      <div class="sub">Use seu perfil da Steam. Só quem está logado vê o Mamômetro.</div>
      ${tabsContaHtml("entrar")}
    </div>`;
  renderFormConta("entrar");
}

// ---- Formulário Entrar / Cadastrar (usado no muro e no modal) ----
function tabsContaHtml(aba) {
  return `<div class="tabs conta-tabs">
      <div class="tab ${aba === "entrar" ? "ativa" : ""}" onclick="trocarTabConta('entrar')">Entrar</div>
      <div class="tab ${aba === "cad" ? "ativa" : ""}" onclick="trocarTabConta('cad')">Cadastrar</div>
    </div>
    <div id="conta-corpo"></div>`;
}
export function abrirConta(aba = "entrar") {
  if (!configurado) {
    alert("O site ainda não foi configurado com o Firebase.");
    return;
  }
  perfilPendente = null;
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharConta()">×</button>
    <h2>Sua conta</h2>
    <div class="sub">Entre com seu perfil da Steam pra aparecer no ranking com avatar.</div>
    ${tabsContaHtml(aba)}`;
  renderFormConta(aba);
  abrir();
}
export function fecharConta() {
  fechar();
}
export function trocarTabConta(aba) {
  document
    .querySelectorAll(".conta-tabs .tab")
    .forEach((t, i) => t.classList.toggle("ativa", (aba === "entrar") === (i === 0)));
  renderFormConta(aba);
}

function renderFormConta(aba) {
  const corpo = document.getElementById("conta-corpo");
  if (!corpo) return;
  const acao = aba === "cad" ? "fazerCadastro()" : "fazerEntrar()";
  corpo.innerHTML = `
    <label>Perfil da Steam (URL ou ID)</label>
    <input id="conta-steam" placeholder="steamcommunity.com/id/seu_nick" autocomplete="off">
    <label>Senha ${aba === "cad" ? `(mín. ${SENHA_MIN})` : ""}</label>
    <input id="conta-senha" type="password" placeholder="senha" onkeydown="if(event.key==='Enter')${acao}">
    <div class="erro" id="conta-erro"></div>
    <div class="row-btns"><button class="btn" id="conta-btn" onclick="${acao}">${
    aba === "cad" ? "Cadastrar" : "Entrar"
  }</button></div>`;
}

function lerCampos() {
  return {
    steam: document.getElementById("conta-steam").value.trim(),
    senha: document.getElementById("conta-senha").value,
    erro: document.getElementById("conta-erro"),
    btn: document.getElementById("conta-btn"),
  };
}

export async function fazerCadastro() {
  const { steam, senha, erro, btn } = lerCampos();
  erro.textContent = "";
  if (!steam) return (erro.textContent = "Cole seu perfil da Steam.");
  if (senha.length < SENHA_MIN)
    return (erro.textContent = `Senha muito curta (mínimo ${SENHA_MIN}).`);
  btn.disabled = true;
  btn.textContent = "Cadastrando...";
  try {
    perfilPendente = await cadastrar(steam, senha);
    mostrarVinculo(); // escolher qual card é você (ou criar novo)
  } catch (e) {
    erro.textContent = msgErroAuth(e);
    btn.disabled = false;
    btn.textContent = "Cadastrar";
  }
}

export async function fazerEntrar() {
  const { steam, senha, erro, btn } = lerCampos();
  erro.textContent = "";
  if (!steam || !senha) return (erro.textContent = "Preencha perfil e senha.");
  btn.disabled = true;
  btn.textContent = "Entrando...";
  try {
    perfilPendente = await entrar(steam, senha);
    // Se já tem card vinculado, fecha; senão, oferece vincular.
    if (jogadorPorSteam(perfilPendente.steamId)) {
      perfilPendente = null;
      fechar();
    } else {
      mostrarVinculo();
    }
  } catch (e) {
    erro.textContent = msgErroAuth(e);
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
}

// ---- Vínculo: reivindicar um card existente ou criar novo ----
function mostrarVinculo() {
  // Já vinculado a este SteamID? (ex.: o admin já tinha te adicionado.)
  // Nada a escolher — a senha foi criada e você já está logado no seu card.
  const jaTem = jogadorPorSteam(perfilPendente.steamId);
  if (jaTem) {
    const nome = jaTem.name;
    perfilPendente = null;
    fechar();
    renderApp();
    alert(`Senha criada! Você entrou como ${nome}.`);
    return;
  }
  const semDono = dados.players.filter((p) => !p.steamId);
  const lista = semDono.length
    ? semDono
        .map(
          (p) =>
            `<button class="tchip" onclick="reivindicar('${p.id}')">${escapar(
              p.name
            )}<span>＋</span></button>`
        )
        .join("")
    : `<div class="tvazio">nenhum card antigo sobrando</div>`;
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharConta()">×</button>
    <h2>Qual card é você?</h2>
    <div class="sub">Logado como <b>${escapar(perfilPendente.name)}</b>. Escolha seu card antigo ou crie um novo.</div>
    <div class="steam-preview">${avImg(perfilPendente.avatar, "")}<div><div class="nm">${escapar(
    perfilPendente.name
  )}</div><div class="id">${escapar(perfilPendente.steamId)}</div></div></div>
    <label>Reivindicar um card existente</label>
    <div class="tcol" style="min-height:auto">${lista}</div>
    <div class="row-btns"><button class="btn gold" onclick="criarNovoJogador()">Sou novo — criar meu card</button></div>`;
  abrir();
}

export function reivindicar(id) {
  const p = dados.players.find((x) => x.id === id);
  if (!p || !perfilPendente) return;
  p.steamId = perfilPendente.steamId;
  p.avatar = perfilPendente.avatar || "";
  p.profileUrl = perfilPendente.profileUrl || "";
  salvar();
  perfilPendente = null;
  fechar();
  renderApp();
}
export function criarNovoJogador() {
  if (!perfilPendente) return;
  dados.players.push({
    id: uid(),
    name: perfilPendente.name,
    steamId: perfilPendente.steamId,
    avatar: perfilPendente.avatar || "",
    profileUrl: perfilPendente.profileUrl || "",
  });
  salvar();
  perfilPendente = null;
  fechar();
  renderApp();
}

export async function sairConta() {
  await sair(); // o listener de auth chama renderApp() → volta pro muro de login
}
