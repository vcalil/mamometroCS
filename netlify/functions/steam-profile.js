// Netlify Function: resolve um perfil da Steam para { steamId, name, avatar, profileUrl }.
// A STEAM_API_KEY fica só aqui no servidor. Faz apenas GET na Steam Web API
// (read-only — não altera nada na conta do jogador).

const STEAM = "https://api.steampowered.com";

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

// Descobre se o input já é um SteamID64 ou um vanity a resolver.
function parseInput(raw) {
  const texto = (raw || "").trim();

  // URL com /profiles/<steamid64>
  const mProf = texto.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (mProf) return { steamId: mProf[1] };

  // URL com /id/<vanity>
  const mId = texto.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (mId) return { vanity: decodeURIComponent(mId[1]) };

  // SteamID64 puro (17 dígitos)
  if (/^\d{17}$/.test(texto)) return { steamId: texto };

  // Caso contrário: trata como vanity puro (remove barras soltas)
  const vanity = texto.replace(/^\/+|\/+$/g, "").split(/[/?#]/)[0];
  if (vanity) return { vanity };

  return {};
}

async function resolverVanity(vanity, key) {
  const url = `${STEAM}/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(
    vanity
  )}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Steam respondeu ${r.status} ao resolver o nome.`);
  const data = await r.json();
  // success === 1 → achou; qualquer outra coisa → não achou
  if (!data.response || data.response.success !== 1 || !data.response.steamid) {
    const e = new Error("Perfil não encontrado. Confira a URL ou o ID.");
    e.statusCode = 404;
    throw e;
  }
  return data.response.steamid;
}

async function buscarResumo(steamId, key) {
  const url = `${STEAM}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Steam respondeu ${r.status} ao buscar o perfil.`);
  const data = await r.json();
  const p = data.response && data.response.players && data.response.players[0];
  if (!p) {
    const e = new Error("Perfil não encontrado ou privado.");
    e.statusCode = 404;
    throw e;
  }
  return {
    steamId: p.steamid,
    name: p.personaname || "Jogador",
    avatar: p.avatarfull || p.avatarmedium || p.avatar || "",
    profileUrl: p.profileurl || `https://steamcommunity.com/profiles/${p.steamid}`,
  };
}

export const handler = async (event) => {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return json(500, {
      error:
        "STEAM_API_KEY não configurada. Pegue uma em steamcommunity.com/dev/apikey e coloque no .env (e no painel do Netlify).",
    });
  }

  const input = (event.queryStringParameters || {}).input;
  const parsed = parseInput(input);
  if (!parsed.steamId && !parsed.vanity) {
    return json(400, { error: "Cole uma URL da Steam ou um SteamID64 válido." });
  }

  try {
    const steamId = parsed.steamId || (await resolverVanity(parsed.vanity, key));
    const perfil = await buscarResumo(steamId, key);
    return json(200, perfil);
  } catch (err) {
    return json(err.statusCode || 502, {
      error: err.message || "Falha ao consultar a Steam.",
    });
  }
};
