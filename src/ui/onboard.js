// F1: Gate de onboard self-serve (sub-componente do SPA).
// Chamado quando o usuário ta logado mas ainda nao fez onboard — exibe
// formulario de "Match History Access Code" + share code, submete em
// /api/onboard, e re-checa o status quando terminar.
//
// O steamId NAO e pedido no form — vem do auth (conta.js extrai via
// steamIdDoUser), ja que a conta Firebase Auth do jogador usa o steamId
// no email (auth.js).

import { ref, get } from "firebase/database";
import { db } from "../firebase.js";
import { steamIdDoUser } from "../auth.js";
import { usuarioAtual } from "../auth.js";

// Estado do gate (controlado por conta.js e pelo submit bem-sucedido).
// "loading"     = check em andamento
// "onboarded"   = ja tem entry em roster/{steamId}, libera o app
// "not_onboarded" = logado mas sem entry, mostra o form
let estado = "loading";
let checkEmCurso = null; // promise do checarOnboard atual (deduplica chamadas)

export function estadoOnboard() {
  return estado;
}

export async function checarOnboard() {
  // Deduplica: se ja tem um check rolando, reusa. Evita a race condition
  // onde o check inicial e um re-check (ex. depois de um erro de submit)
  // batem cabeça e o segundo resultado sobrescreve o primeiro.
  if (checkEmCurso) return checkEmCurso;
  const user = usuarioAtual();
  if (!user) {
    estado = "loading";
    return "loading";
  }
  const steamId = steamIdDoUser(user);
  if (!steamId || !db) {
    estado = "not_onboarded";
    return "not_onboarded";
  }
  checkEmCurso = (async () => {
    estado = "loading";
    try {
      const snap = await get(ref(db, `roster/${steamId}`));
      const entry = snap.val();
      // IMPORTANTE: nao sobrescreve "onboarded" setado por um submit recente
      // (window.__mamometroOnboardState ja' em "onboarded" e o RTDB ainda nao
      // propagou). So atualiza se o state global ainda for "loading" (i.e.,
      // nao houve submit recente).
      const novoEstado = entry && entry.status === "active" ? "onboarded" : "not_onboarded";
      if (window.__mamometroOnboardState !== "onboarded") {
        estado = novoEstado;
      }
    } catch (e) {
      console.warn("[onboard] check falhou:", e);
      if (window.__mamometroOnboardState !== "onboarded") {
        estado = "not_onboarded";
      }
    } finally {
      checkEmCurso = null;
    }
    return estado;
  })();
  return checkEmCurso;
}

export function marcarOnboarded() {
  estado = "onboarded";
  // Tambem atualiza o state global que o conta.js renderApp() le. Sem isso,
  // o event 'mamometro:onboard-done' dispara renderApp() mas ele ainda ve
  // 'not_onboarded' no window state e re-renderiza o gate.
  if (typeof window !== "undefined") {
    window.__mamometroOnboardState = "onboarded";
  }
  // Limpa o check pendente pra nao ter race (o check pode voltar com
  // "not_onboarded" do RTDB antes da propagacao da escrita).
  checkEmCurso = null;
}

// Submete o form de onboard. steamId vem do usuario logado (NUNCA do form).
export async function submeterOnboard(authCode, shareCode) {
  const user = usuarioAtual();
  if (!user) throw new Error("Sessao expirou. Faz login de novo.");
  const steamId = steamIdDoUser(user);
  if (!steamId) throw new Error("Conta sem steamId vinculado. Recarrega e tenta de novo.");

  let r;
  try {
    r = await fetch("/api/onboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        steamId, // derivado do auth, nao confia em input
        authCode: (authCode || "").trim(),
        shareCode: (shareCode || "").trim(),
      }),
    });
  } catch (e) {
    throw new Error("Erro de rede. Verifica tua conexao e tenta de novo.");
  }
  let body = {};
  try {
    body = await r.json();
  } catch {}
  if (!r.ok || !body.ok) {
    throw new Error(traduzErro(body));
  }
  marcarOnboarded();
  return body;
}

function traduzErro(body) {
  const code = body && body.error;
  const msg = body && body.message;
  switch (code) {
    case "auth_code_invalid":
      return "A Steam rejeitou o par de codes. Causas comuns: code colado errado, code gerado há muito tempo, ou share code não é dessa conta. Gera um novo par e tenta de novo.";
    case "share_code_invalid":
      return "A Steam disse que o share code não bate com essa conta. Causas comuns: share code é de outra conta, de uma partida de FACEIT (não serve — tem que ser de Valve MM), ou já foi revogado. Pega um share code novo de uma partida recente de Premier/Competitive e tenta de novo.";
    case "profile_not_found":
      return "Conta Steam não encontrada. Confere e tenta de novo.";
    case "invalid_input":
    case "invalid_profile_url":
      return msg || "Algum campo está em formato errado. Confere o formato (AAAA-1111-BBBB e CSGO-XXXXX-...-XXXXX).";
    case "steam_api_key_missing":
    case "firebase_not_configured":
    case "firebase_init_failed":
      return "Erro de configuração do servidor. Avisa o admin.";
    default:
      return msg || "Erro inesperado. Tenta de novo em alguns segundos.";
  }
}

// Render do gate — chamado por conta.js. Substitui o conteúdo principal
// ate' o usuario completar o onboard.
export function renderOnboardGate(steamId) {
  const el = document.getElementById("conteudo");
  if (!el) return;
  // Esconde o resumo de stats enquanto o cara nao onboardou
  const resumo = document.querySelector(".resumo");
  if (resumo) resumo.style.display = "none";

  el.innerHTML = `
    <div class="setup" id="onboard-gate" style="max-width:680px;margin:24px auto;padding:28px;">
      <h3 style="font-family:Anton,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:1px;font-size:1.4rem;margin-bottom:6px;">Rastreamento automático de partidas</h3>
      <div class="sub" style="color:var(--muted);font-size:.95rem;margin-bottom:18px;">
        <b>Nova feature:</b> ativa o bot pra puxar e processar automaticamente todas as tuas próximas
        partidas de CS2. Cola os 2 códigos abaixo — o <em>código de autenticação</em> é o
        token persistente que a Steam te dá, e o <em>token da partida mais recente</em> é o
        ponto de partida de onde o bot começa a caminhar pra trás. Depois de ativar,
        o bot cuida dos próximos matches sozinho.
      </div>

      <form id="onboard-form" novalidate>
        <label for="ob-auth" style="display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px;">
          Código de autenticação
        </label>
        <input
          id="ob-auth"
          name="authCode"
          type="text"
          required
          autocomplete="off"
          spellcheck="false"
          pattern="^[A-Za-z0-9]{4,5}-[A-Za-z0-9]{4,5}-[A-Za-z0-9]{4,5}$"
          placeholder="AAAA-1111-BBBB"
          style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:12px 13px;font-family:'Space Mono',monospace;font-size:1rem;text-transform:uppercase;letter-spacing:1px;"
        >

        <label for="ob-share" style="display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px;">
          Token da tua partida mais recente
        </label>
        <input
          id="ob-share"
          name="shareCode"
          type="text"
          required
          autocomplete="off"
          spellcheck="false"
          pattern="^CSGO-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$"
          placeholder="CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          style="width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:12px 13px;font-family:'Space Mono',monospace;font-size:1rem;letter-spacing:1px;"
        >

        <button type="submit" id="ob-submit" style="background:var(--coral);color:#2a0713;border:none;border-radius:10px;padding:13px 16px;font-family:'Inter';font-weight:700;font-size:.95rem;cursor:pointer;width:100%;margin-top:18px;text-transform:uppercase;letter-spacing:1px;">
          Entrar no Mamômetro
        </button>
      </form>

      <div id="ob-status" role="status" aria-live="polite" style="min-height:1.2em;margin-top:16px;font-size:.95rem;"></div>

      <div class="aviso" style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:.78rem;color:var(--muted);margin-top:18px;">
        Tua SteamID: <code style="background:var(--bg);padding:1px 6px;border-radius:4px;font-family:'Space Mono',monospace;color:var(--ink);">${escapeHtml(steamId || "?")}</code>
        (vem da tua conta, nao precisa digitar)
      </div>
    </div>
  `;

  const form = document.getElementById("onboard-form");
  const status = document.getElementById("ob-status");
  const submitBtn = document.getElementById("ob-submit");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    status.innerHTML = "Validando com a Steam…";
    status.style.color = "var(--muted)";
    submitBtn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      const body = await submeterOnboard(data.authCode, data.shareCode);
      status.innerHTML = `✅ Pronto! Você está no Mamômetro como <b>${escapeHtml(body.name || "novo membro")}</b>. Carregando o ranking…`;
      status.style.color = "var(--mint)";
      // Belt-and-suspenders: chama renderApp() direto E dispara o event.
      // O event e' pro main.js re-renderizar; o direto e' caso o listener
      // nao esteja registrado (improvavel mas defensivo).
      window.dispatchEvent(new CustomEvent("mamometro:onboard-done"));
      import("./conta.js").then((m) => m.renderApp());
    } catch (e) {
      // Erro fica bem visivel. Botao "re-verificar status" pra forcar um
      // novo check (cobre caso o submit deu certo mas o check ainda nao viu
      // a propagacao no RTDB).
      status.innerHTML = `
        <div style="color:var(--coral);font-weight:600;margin-bottom:8px;">❌ ${escapeHtml(e.message)}</div>
        <button type="button" id="ob-recheck" class="btn-org" style="margin-top:4px;">
          Já fiz onboard antes, re-verificar status
        </button>
      `;
      submitBtn.disabled = false;
      const recheckBtn = document.getElementById("ob-recheck");
      if (recheckBtn) {
        recheckBtn.addEventListener("click", async () => {
          recheckBtn.disabled = true;
          recheckBtn.textContent = "Verificando…";
          await checarOnboard();
          // apos re-check, renderApp() decide se mostra o ranking ou o gate
          import("./conta.js").then((m) => m.renderApp());
        });
      }
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
