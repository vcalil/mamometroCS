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

export function estadoOnboard() {
  return estado;
}

export async function checarOnboard() {
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
  estado = "loading";
  try {
    const snap = await get(ref(db, `roster/${steamId}`));
    const entry = snap.val();
    estado = entry && entry.status === "active" ? "onboarded" : "not_onboarded";
  } catch (e) {
    // Em caso de erro de rede, deixa passar (assume nao-onboarded pra forçar
    // o form, que e' o caminho conservador).
    console.warn("[onboard] check falhou:", e);
    estado = "not_onboarded";
  }
  return estado;
}

export function marcarOnboarded() {
  estado = "onboarded";
}

// Submete o form de onboard. steamId vem do usuario logado (NUNCA do form).
export async function submeterOnboard(authCode, shareCode) {
  const user = usuarioAtual();
  if (!user) throw new Error("Sessao expirou. Faz login de novo.");
  const steamId = steamIdDoUser(user);
  if (!steamId) throw new Error("Conta sem steamId vinculado. Recarrega e tenta de novo.");

  const r = await fetch("/api/onboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      steamId, // derivado do auth, nao confia em input
      authCode: (authCode || "").trim(),
      shareCode: (shareCode || "").trim(),
    }),
  });
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
      <h3 style="font-family:Anton,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:1px;font-size:1.4rem;margin-bottom:6px;">Bem-vindo ao Mamômetro</h3>
      <div class="sub" style="color:var(--muted);font-size:.95rem;margin-bottom:18px;">
        Antes de ver o ranking, você precisa registrar tua conta Steam no bot de demos.
        São 2 códigos, leva 2 min.
      </div>

      <ol class="steps" style="margin:0 0 18px 20px;line-height:1.7;font-size:.9rem;">
        <li>
          <a href="https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128" target="_blank" rel="noopener">Abra o wizard oficial do CS2</a>
          em outra aba, faça login na Steam se pedir, e gere o <b>Match History Access Code</b>.
          É o token persistente do CS2 (formato <code>AAAA-1111-BBBB</code>) — <b>não</b> confunde com o "Login Auth Code" de 5 minutos do Steam client.
        </li>
        <li>
          Jogue uma partida de CS2 (Premier/Competitive/etc — Valve Matchmaking, não FACEIT) e copie o <em>share code</em>:
          menu principal → <b>Watch</b> → <b>Your Matches</b> → última partida → <b>Copy Share Code</b>
          (formato <code>CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX</code>).
        </li>
        <li>Cole os 2 códigos aqui embaixo.</li>
      </ol>

      <form id="onboard-form" novalidate>
        <label for="ob-auth" style="display:block;font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px;">
          Match History Access Code (CS2)
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
          Share code da última partida
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
    status.textContent = "Validando com a Steam…";
    status.style.color = "var(--muted)";
    submitBtn.disabled = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      const body = await submeterOnboard(data.authCode, data.shareCode);
      status.textContent = `Pronto! Você está no Mamômetro como ${body.name || "novo membro"}. Carregando o ranking…`;
      status.style.color = "var(--mint)";
      // Sinaliza pro conta.js re-renderizar (libera o gate)
      window.dispatchEvent(new CustomEvent("mamometro:onboard-done"));
    } catch (e) {
      status.textContent = e.message;
      status.style.color = "var(--coral)";
      submitBtn.disabled = false;
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
