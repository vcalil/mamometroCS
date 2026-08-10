# Modelo de dados — Firebase Realtime Database

Referência dos nós do RTDB do Mamômetro. Serve de contrato entre o SPA, as
functions (`/api/*`) e os serviços Python da VPS. Permissões de escrita ficam em
[`REGRAS-FIREBASE.md`](REGRAS-FIREBASE.md); aqui é a **forma** dos dados.

> Convenção: SteamID64 é sempre string de 17 dígitos. Os nós que o SPA lê podem
> aparecer como **array** ou como **objeto chaveado** (o RTDB "encolhe" arrays
> esparsos pra objeto) — por isso os leitores normalizam os dois (ver
> `mm_common.firebase.normalize_players` no lado Python e `statsList` no SPA).

## `estado/` — o que o ranking usa (SPA)

- **`estado/players`** — elenco. Array de:
  ```
  { id, steamId, name, avatar, profileUrl, apelido?, csRating?, rankType? }
  ```
  `id` = id interno do SPA (`state.js uid()`); `csRating`/`rankType` vêm da demo
  (rankType 11 = Premier). Escrito no vínculo de card (SPA) e pelo onboard
  (`/api/onboard` adiciona quem onboarda) — sempre **read-modify-write**.
- **`estado/matches`** — partidas que contam no ranking. Array de:
  ```
  { id, date, map, meta:{kills,damage}, stats:[{id,kills,damage}], entries:[{from,to}] }
  ```
  `entries` = mamadas: `from` mamou `to` (quem não bateu a meta mamou quem bateu).
  `id` = fingerprint da demo (dedup) ou id do SPA quando lançada pelo organizador.
- **`estado/meta`** — `{ kills, damage }`. Meta atual (padrão 15/1500).

## `roster/{steamId}` — onboard (bot)

`{ name, authCode, anchorCode, status:"active", updatedAt }`. Escrito por
`/api/onboard` (Admin SDK) após validar os códigos na Steam. Leitura só do próprio
dono (regras). O `authCode` é o token de partilha da Steam — **segredo**; o
`roster-sync` lê pra regenerar o config do downloader.

## `matches/{fingerprint}` — demo bruta (pipeline)

Match cru salvo pelo `demo-parser` antes de virar `estado/matches`:
```
{ date, map, mode, source:"demo", groupMatch:true, groupCount:N,
  players:[{ steamId, name, kills, deaths, assists, damage, adr, hs, mvps,
             utilityDamage, enemiesFlashed, csRating, rankType, flashAssists }] }
```
`fingerprint` = sha1(steamids ordenados | mapa | data) → idempotente.

## `pipeline/status/{steamId}` — telemetria do bot

`{ discardedByFilter, ... }`. Contadores do pipeline (ex.: partidas descartadas
por não bater o `GROUP_MIN_MEMBERS`). Escrito por demo-parser/roster-sync.

## Outros nós (SPA)

- **`papeis/{steamId}`** — `"master"` | `"organizador"`. Define quem abre o painel.
- **`seasons/`** — temporadas (janelas de data do ranking).
- **`submissoes/`** — fila de partidas enviadas pela galera (aprovação do organizador).
- **`propostas/`** — assembleia: sugestões de meta/regra + votos dos organizadores.
- **`gsi/live/`, `gsi/pending/`** — kills/dano ao vivo do CS2 via GSI (`/api/gsi`).

## Integração pipeline → ranking (F2)

O `demo-parser` salva em `matches/{fp}` **e** publica em `estado/matches`
(`publish_to_ranking`): mapeia `steamId → id` via `estado/players`, calcula
winners/losers pela `meta` e monta os `entries`. Só entram jogadores presentes em
`estado/players`. Tudo **read-modify-write** (nunca `set()` cego — histórico de
perda de dados).
