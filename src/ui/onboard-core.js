// Lógica PURA de onboarding, compartilhada entre o gate do SPA (onboard.js) e a
// página standalone (onboard.html). Sem dependência de Firebase — só escape, o
// mapa de erros e o POST — pra poder ser importada nos dois lados sem puxar SDK.

export { STEAM_CODES_URL } from "./onboard-guide.js";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Traduz o { error, message } da /api/onboard numa mensagem amigável.
export function traduzErro(body) {
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
    case "method_not_allowed":
      return "Método não permitido — tenta de novo.";
    default:
      return msg || "Erro inesperado. Tenta de novo em alguns segundos.";
  }
}

// POST /api/onboard. Aceita steamId (derivado do auth) e/ou profileUrl (fallback
// da página standalone pra quem não está logado). Retorna o body em sucesso;
// lança Error(mensagem amigável) em falha.
export async function postOnboard({ steamId, profileUrl, authCode, shareCode }) {
  let r;
  try {
    r = await fetch("/api/onboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(steamId ? { steamId } : {}),
        ...(profileUrl ? { profileUrl } : {}),
        authCode: (authCode || "").trim(),
        shareCode: (shareCode || "").trim(),
      }),
    });
  } catch {
    throw new Error("Erro de rede. Verifica tua conexao e tenta de novo.");
  }
  let body = {};
  try {
    body = await r.json();
  } catch {}
  if (!r.ok || !body.ok) throw new Error(traduzErro(body));
  return body;
}
