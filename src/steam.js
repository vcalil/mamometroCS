// Cliente da integração Steam. Chama a Netlify Function, que faz o
// trabalho pesado no servidor (a chave da Steam fica lá, não no navegador).
// Retorna { steamId, name, avatar, profileUrl } ou lança Error com mensagem
// amigável.
export async function buscarPerfilSteam(input) {
  const texto = (input || "").trim();
  if (!texto) throw new Error("Cole a URL ou o ID do perfil da Steam.");

  let resp;
  try {
    resp = await fetch(
      "/api/steam-profile?input=" + encodeURIComponent(texto)
    );
  } catch {
    throw new Error(
      "Não deu pra falar com o servidor. Rode o servidor local (`npm run start`) — o Vite puro não sobe as functions."
    );
  }

  let body = {};
  try {
    body = await resp.json();
  } catch {
    /* resposta sem JSON */
  }

  if (!resp.ok) {
    throw new Error(body.error || `Erro ${resp.status} ao buscar o perfil.`);
  }
  return body;
}
