// Validação opcional pelo Leetify: confere as KILLS declaradas contra o
// histórico público do jogador. Serve de segunda opinião pro organizador —
// nunca decide sozinho.
//
// Limites conhecidos (medidos na API, não suposições):
//  - a API é pública e manda CORS liberado, então dá pra chamar do navegador;
//  - `gameFinishedAt` tem precisão de DIA (sem hora). Como é comum jogar mais
//    de uma partida no mesmo dia, um dia pode ter vários candidatos — por isso
//    devolvemos TODOS e deixamos o organizador escolher;
//  - o DANO não vem no perfil público (fica atrás de `isSensitiveDataVisible`),
//    então só dá pra validar kills.

const BASE = "https://api.leetify.com/api/profile/id/";

// Busca as partidas de CS2 de um SteamID num dia (YYYY-MM-DD).
// Devolve [] se o perfil não existe, não tem dados ou a API falha — validação
// é um extra, nunca pode derrubar o envio da partida.
export async function partidasDoDia(steamId, data) {
  if (!steamId || !data) return [];
  try {
    const r = await fetch(BASE + encodeURIComponent(steamId));
    if (!r.ok) return [];
    const j = await r.json();
    return (j.games || [])
      .filter((g) => g.isCs2 && (g.gameFinishedAt || "").slice(0, 10) === data)
      .map((g) => ({
        kills: g.kills,
        deaths: g.deaths,
        mapa: g.mapName || "",
        resultado: g.matchResult || "",
      }));
  } catch {
    return [];
  }
}

// Valida uma lista de entradas [{ steamId, name, kills }] contra o Leetify.
// Resultado por jogador:
//   status: "confere" | "difere" | "ambiguo" | "sem-dados"
export async function validar(entries, data) {
  const alvos = (entries || []).filter((e) => e.steamId);
  const out = {};
  await Promise.all(
    alvos.map(async (e) => {
      const jogos = await partidasDoDia(e.steamId, data);
      if (!jogos.length) {
        out[e.steamId] = { status: "sem-dados", jogos: [] };
        return;
      }
      const bate = jogos.filter((g) => g.kills === Number(e.kills));
      out[e.steamId] = {
        status: bate.length
          ? jogos.length > 1 && bate.length < jogos.length
            ? "confere"
            : "confere"
          : jogos.length > 1
            ? "ambiguo"
            : "difere",
        declarado: Number(e.kills),
        jogos,
      };
    })
  );
  return out;
}
