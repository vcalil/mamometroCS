import {
  dados,
  salvarJogadores,
  uid,
  escapar,
  aguardarDados,
  dadosCarregados,
} from "../state.js";
import { buscarPerfilSteam } from "../steam.js";
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

  const user = usuarioAtual();
  if (!user) {
    if (resumo) resumo.style.display = "none";
    // Só (re)constrói o muro se ele ainda não está na tela — assim uma
    // atualização de dados ao vivo não apaga o que a pessoa está digitando.
    if (!document.querySelector("#conteudo .gate")) renderLoginGate();
    return;
  }

  // Logado: checa se ja fez onboard. Se nao, mostra o gate de onboard e
  // esconde o ranking. O check de roster/{steamId} e' assincrono; enquanto
  // carrega, mostra "Verificando...".
  const onboardState = window.__mamometroOnboardState || "loading";
  if (onboardState === "loading") {
    if (resumo) resumo.style.display = "none";
    const c = document.getElementById("conteudo");
    if (c && !document.getElementById("onboard-gate")) {
      c.innerHTML = `<div class="vazio">Verificando se você já fez onboard…</div>`;
    }
    return;
  }
  if (onboardState === "not_onboarded") {
    if (resumo) resumo.style.display = "none";
    if (!document.getElementById("onboard-gate")) {
      // lazy-load do modulo de onboard pra nao pesar o bundle inicial
      import("./onboard.js").then((m) => {
        const sid = steamIdDoUser(user);
        m.renderOnboardGate(sid);
      });
    }
    return;
  }
  // onboarded: mostra o ranking
  if (resumo) resumo.style.display = "";
  render();
}

// Cabeçalho: só mostra chip/Organizador quando logado (o muro cuida do login).
export function renderConta() {
  const el = document.getElementById("conta");
  if (!el) return;
  const user = configurado ? usuarioAtual() : null;
  if (user) {
    const p = jogadorPorSteam(steamIdDoUser(user));
    const nome = p ? p.name : "jogador";
    const apel = p && p.apelido ? ` <span class="apelido">(${escapar(p.apelido)})</span>` : "";
    const orgBtn = ehAdmin()
      ? `<button class="btn-org" onclick="abrirAdmin()">Organizador</button>`
      : "";
    // Sem card vinculado? Atalho pra reivindicar o do histórico a qualquer hora.
    const vincBtn = p
      ? `<button class="btn-org" onclick="editarApelido()">Apelido</button>`
      : `<button class="btn-org" onclick="vincularCard()">Vincular meu card</button>`;
    // Enviar partida é aberto a todos: o organizador aprova depois.
    const envBtn = `<button class="btn-org" onclick="abrirEnviar()">Enviar partida</button>`;
    const asmBtn = `<button class="btn-org" onclick="abrirAssembleia()">Assembleia</button>`;
    el.innerHTML = `${envBtn}${asmBtn}${vincBtn}${orgBtn}<span class="conta-logado">${avImg(
      p && p.avatar
    )}<span class="cn">${escapar(nome)}${apel}</span><button class="conta-sair" onclick="sairConta()">sair</button></span>`;
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
    // Espera o primeiro snapshot: sem isso a lista de cards sai vazia — e criar
    // card com a lista vazia sobrescreveria o elenco inteiro.
    btn.textContent = "Carregando cards...";
    if (!(await aguardarDados())) {
      erro.textContent =
        "Não consegui carregar os jogadores. Confira a conexão e tente de novo.";
      btn.disabled = false;
      btn.textContent = "Cadastrar";
      return;
    }
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
    // Mesma espera do cadastro: só dá pra saber se há card depois do snapshot.
    btn.textContent = "Carregando...";
    if (!(await aguardarDados())) {
      erro.textContent =
        "Não consegui carregar os jogadores. Confira a conexão e tente de novo.";
      btn.disabled = false;
      btn.textContent = "Entrar";
      return;
    }
    // Se já tem card vinculado, atualiza nome/avatar da Steam e fecha; senão, oferece vincular.
    const cardExistente = jogadorPorSteam(perfilPendente.steamId);
    if (cardExistente) {
      sincronizarDaSteam(cardExistente, perfilPendente);
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

// Oferece a tela de vínculo a quem está logado mas ainda não tem card.
// Fica disponível enquanto houver gente do histórico sem dono — é o que
// permite a galera antiga ir reivindicando os cards aos poucos.
let vinculoOferecido = false;
let jaSincronizou = false; // já puxou nome/avatar da Steam nesta sessão?
export function resetarOfertaVinculo() {
  vinculoOferecido = false;
  jaSincronizou = false;
}

// Atualiza nome/avatar/URL do card com o que está na Steam agora (se mudou).
// É o que faz o nome "seguir" a Steam e conserta cards com nome manual antigo.
function sincronizarDaSteam(card, perfil) {
  if (!card || !perfil || !dadosCarregados()) return;
  let mudou = false;
  if (perfil.name && perfil.name !== card.name) {
    card.name = perfil.name;
    mudou = true;
  }
  if (perfil.avatar && perfil.avatar !== card.avatar) {
    card.avatar = perfil.avatar;
    mudou = true;
  }
  if (perfil.profileUrl && perfil.profileUrl !== card.profileUrl) {
    card.profileUrl = perfil.profileUrl;
    mudou = true;
  }
  if (mudou) {
    salvarJogadores();
    renderApp();
  }
}

// Define/troca o apelido do próprio card (aparece ao lado do nome).
export function editarApelido() {
  const sid = steamIdDoUser(usuarioAtual());
  const card = sid ? jogadorPorSteam(sid) : null;
  if (!card) return alert("Você ainda não tem um card vinculado.");
  if (!dadosCarregados()) return alert("Aguarde os dados carregarem e tente de novo.");
  const novo = prompt(
    "Seu apelido (aparece ao lado do nome, pra facilitar identificar).\nDeixe vazio pra remover:",
    card.apelido || ""
  );
  if (novo === null) return; // cancelou
  card.apelido = novo.trim() || null;
  salvarJogadores();
  renderApp();
}

export async function garantirVinculo({ forcado = false } = {}) {
  const user = usuarioAtual();
  if (!user) return;
  const sid = steamIdDoUser(user);
  if (!sid) return;
  if (vinculoOferecido && !forcado) return; // não reabre a cada snapshot
  if (!(await aguardarDados())) return; // dados não carregaram: não arrisca vínculo
  if (jogadorPorSteam(sid)) {
    // Já vinculado: puxa nome/avatar da Steam uma vez por sessão (ex.: recarregou logado).
    if (!jaSincronizou) {
      jaSincronizou = true;
      buscarPerfilSteam(sid)
        .then((perfil) => sincronizarDaSteam(jogadorPorSteam(sid), perfil))
        .catch(() => {});
    }
    return;
  }
  vinculoOferecido = true;
  if (!perfilPendente || perfilPendente.steamId !== sid) {
    // Recupera nome/avatar da Steam (ex.: recarregou a página já logado).
    try {
      perfilPendente = await buscarPerfilSteam(sid);
    } catch {
      perfilPendente = { steamId: sid, name: "Jogador", avatar: "" };
    }
  }
  mostrarVinculo();
}

// Botão do cabeçalho: reabre a tela mesmo que a pessoa já tenha fechado.
export function vincularCard() {
  garantirVinculo({ forcado: true });
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

// Trava de segurança: gravar a lista de jogadores SEM os dados carregados
// sobrescreveria o elenco inteiro com uma lista quase vazia (foi o que apagou
// os players). Só grava se o snapshot realmente chegou.
function dadosProntosOuAvisa() {
  if (dadosCarregados()) return true;
  alert(
    "Os dados ainda não carregaram. Recarregue a página e tente de novo — " +
      "assim a gente não sobrescreve o elenco por engano."
  );
  return false;
}

export function reivindicar(id) {
  const p = dados.players.find((x) => x.id === id);
  if (!p || !perfilPendente) return;
  if (!dadosProntosOuAvisa()) return;
  p.steamId = perfilPendente.steamId;
  p.avatar = perfilPendente.avatar || "";
  p.profileUrl = perfilPendente.profileUrl || "";
  salvarJogadores();
  perfilPendente = null;
  fechar();
  renderApp();
}
export function criarNovoJogador() {
  if (!perfilPendente) return;
  if (!dadosProntosOuAvisa()) return;
  dados.players.push({
    id: uid(),
    name: perfilPendente.name,
    steamId: perfilPendente.steamId,
    avatar: perfilPendente.avatar || "",
    profileUrl: perfilPendente.profileUrl || "",
  });
  salvarJogadores();
  perfilPendente = null;
  fechar();
  renderApp();
}

export async function sairConta() {
  await sair(); // o listener de auth chama renderApp() → volta pro muro de login
}
