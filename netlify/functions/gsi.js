// Netlify Function: recebe o Game State Integration (GSI) do CS2.
// O CS2 de cada jogador faz POST do estado do jogo aqui durante a partida.
// A gente acumula kills (match_stats.kills, já é acumulado) e dano (soma do
// round_totaldmg de cada round) do JOGADOR LOCAL, e ao fim da partida grava um
// resultado "pendente" pro admin confirmar.
//
// Estado intermediário e pendências ficam no Realtime Database via REST, sem
// Admin SDK: as regras liberam escrita anônima só em `gsi/*` (o CS2 não tem
// login). O resto do banco exige sessão — ver firebase-rules.json.

const TOKEN = process.env.GSI_TOKEN || "mamometro-gsi";
// Sem fallback de propósito: um padrão hardcoded faria a function gravar no
// banco errado caso a variável não esteja setada no Netlify.
const DB = process.env.FIREBASE_DATABASE_URL;

const ok = () => ({ statusCode: 200, body: "ok" });

async function dbGet(path) {
  const r = await fetch(`${DB}/${path}.json`);
  return r.ok ? r.json() : null;
}
function dbPut(path, data) {
  return fetch(`${DB}/${path}.json`, { method: "PUT", body: JSON.stringify(data) });
}
function dbDelete(path) {
  return fetch(`${DB}/${path}.json`, { method: "DELETE" });
}
function dbPush(path, data) {
  return fetch(`${DB}/${path}.json`, { method: "POST", body: JSON.stringify(data) });
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "POST only" };
  if (!DB) {
    console.error("FIREBASE_DATABASE_URL não configurada — GSI desativado.");
    return { statusCode: 500, body: "db nao configurado" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "bad json" };
  }

  // Token errado? Ignora silenciosamente (não vaza que existe).
  if (!body.auth || body.auth.token !== TOKEN) return ok();

  const provider = body.provider || {};
  const player = body.player || {};
  const map = body.map || {};
  const steamid = provider.steamid;

  // Só interessa o jogador LOCAL (não quem ele está espectando).
  if (!steamid || player.steamid !== steamid) return ok();

  const phase = map.phase; // warmup | live | intermission | gameover
  const live = `gsi/live/${steamid}`;

  // Aquecimento = nova partida começando: zera o acumulado.
  if (phase === "warmup") {
    await dbDelete(live);
    return ok();
  }

  const kills = Number(player.match_stats && player.match_stats.kills) || 0;
  const roundDmg = Number(player.state && player.state.round_totaldmg) || 0;
  const round = Number(map.round) || 0;

  if (phase === "live") {
    const cur = (await dbGet(live)) || { rounds: {}, kills: 0 };
    cur.rounds = cur.rounds || {};
    // Guarda o maior dano visto naquele round (é o total do round).
    cur.rounds[round] = Math.max(cur.rounds[round] || 0, roundDmg);
    cur.kills = kills;
    cur.name = player.name || cur.name || "Jogador";
    cur.map = map.name || cur.map || "";
    cur.mode = map.mode || cur.mode || "";
    await dbPut(live, cur);
    return ok();
  }

  if (phase === "gameover") {
    const cur = await dbGet(live);
    if (cur) {
      const damage = Object.values(cur.rounds || {}).reduce(
        (a, b) => a + (Number(b) || 0),
        0
      );
      await dbPush("gsi/pending", {
        steamId: steamid,
        name: cur.name || player.name || "Jogador",
        kills: Math.max(cur.kills || 0, kills),
        damage,
        map: cur.map || map.name || "",
        mode: cur.mode || map.mode || "",
        ts: Date.now(),
      });
      await dbDelete(live); // evita duplicar em POSTs repetidos de gameover
    }
    return ok();
  }

  return ok();
};
