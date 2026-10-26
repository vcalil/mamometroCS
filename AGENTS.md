# AGENTS.md — Mamômetro

Orientação para agentes de código que trabalham neste repo. Contexto de
arquitetura, decisões já tomadas e gotchas — para não repetir investigações
ou reverter decisões sem saber o porquê.

## O que é

Mamômetro é um ranking de "mamadas" do CS2 para um grupo de amigos. A demo é a
fonte de verdade: o downloader busca share codes do CS2, baixa `.dem`, o parser
extrai kills/dano/CS Rating, e o site (SPA estático em `src/`, deploy no Netlify)
publica o ranking a partir do Firebase Realtime Database (RTDB).

## Arquitetura do pipeline (a cadeia completa)

```
Steam API (share codes)
  → cs-demo-downloader (fork patcheado, IMAGEM LOCAL — NÃO é o upstream)
      → baixa .dem via VPN (ProtonVPN)
      → grava em /demos
  → demo-parser (este repo, `demo-parser/`)
      → parse + filtro de grupo (≥4 do roster) → save em matches/{fp}
      → publish em estado/matches (transação atômica — ver gotchas)
  → roster-sync (`roster-sync/`)
      → lê roster/ do RTDB → regenera config.json do downloader
      → preserva oldestShareCode avançado (nunca regride)
  → SPA (`src/`, netlify/) lê estado/* e renderiza o ranking
```

Componentes de **este repo**:
- `demo-parser/` — Python (demoparser2/Rust): `watch` (daemon), `demo` (dry-run),
  `backfill-ranks`. Salva em `matches/{fp}` e publica em `estado/matches`.
- `roster-sync/` — Python: watcher do roster no RTDB → escreve o
  `config.json` do downloader (`CONFIG_OUTPUT_PATH`). Preserva `authCodes`
  existentes (oldestShareCode avançado) e NUNCA regride.
- `mm_common/` — init lazy do Admin SDK + `normalize_players` (aceita
  array|objeto|lista-de-str).
- `src/` — SPA vanilla (state.js, submissoes.js, admin.js, enviar.js). Lê
  `estado/*`; aceita array E objeto nos leitores.
- `gsi/`, `tools/` — utilidades/experimentos (alguns mortos; não assumir uso).

## Modelo de dados (resumo — detalhe em SCHEMA-RTDB.md)

- `estado/players` — elenco, array. `id` interno do SPA; `csRating`/`rankType`
  vêm da demo (rankType 11 = Premier).
- `estado/matches` — **array** de `{id, date, map, meta, stats[], entries[]}`.
  `entries` = mamadas (`from` mamou `to`). `id` = fingerprint da demo.
- `estado/meta` — `{kills, damage}` (padrão 15/1500).
- `matches/{fingerprint}` — demo bruta pós-parse (fonte da verdade intacta).
- `roster/{steamId}` — onboard (authCode/anchorCode). **authCode é segredo.**

## Decisões e gotchas (não reverter sem ler isto)

1. **`estado/matches` é atualizado com TRANSAÇÃO no publish.** Antes era
   read-modify-write do array inteiro (`get → append → set`) e dois writers
   concorrentes (parser em catch-up + SPA admin) faziam lost update — partidas
   sumiam. O commit 7a71e93 tentou corrigir mudando para escrita por-chave
   (objeto keyed) + migração; foi revertido (a8d6d3c) por ser superdimensionado.
   O fix vigente (PR #8) usa `ref.transaction` mantendo o formato array.
   **Nunca retornar `None` do update function do transaction** — no firebase-admin
   Python isso grava `null` e apaga o nó inteiro. Dedup = retornar a lista
   inalterada (no-op).
2. **O downloader é um FORK patcheado, não o upstream do Claabs.** O fork
   `guuilp/cs-demo-downloader` (branch `feat/throttle-safe-downloads`) tem 11
   patches: throttle-safe, cache de share codes, IPv4, no-retry 502, checkpoint
   por usuário, race do store, checkpoint não avança em download falho, timeout
   nos runs. **O PR #6 foi fechado** — o uso aqui diverge do upstream (imagem
   local `mamometro-downloader:local`, não a pública). Não reabrir o PR.
3. **Downloader roda em cron (runOnce=false) com timeout.** `timeout 3600`
   envolve os runs no entrypoint — mata hang do game coordinator sem watchdog
   externo. O watchdog foi REMOVIDO deste repo (commit `f0e1a96`): o sinal que
   ele usava (mtime de /demos) era quebrado (parser deleta .dem após processar).
4. **Parser deleta .dem após processar** (`DELETE_AFTER_PROCESS=true` default).
   /demos fica vazio — NÃO usar mtime de /demos como sinal de progresso. O
   `demo-log.csv` (escrito pelo downloader) é o sinal confiável.
5. **`config.json` do downloader é regenerado pelo roster-sync** a cada mudança
   de roster. Preserva `logLevel`/`runOnStartup`/`cronSchedule` e o
   `oldestShareCode` avançado; **`runOnce` NÃO é preservado** (some na
   regeneração — o default do downloader é false = cron ativo). Não colocar
   configuração crítica no config.json esperando que persista se o roster mudar.
6. **Rank dos cards**: o parser propaga `csRating`/`rankType`/`rankDate` do
   Premier mais recente para `estado/players` (idempotente, guarda por date).
   `backfill-ranks` recomputa do histórico de `matches/`.
7. **SteamID64 é sempre string de 17 dígitos.** RTDB pode encolher arrays
   esparsos para objeto — leitores normalizam array|objeto (normalize_players,
   statsList). Nunca assumir formato fixo nos leitores.
8. **Segredos**: `config.json` tem authCodes/steamApiKey/bot creds; `store.json`
   tem refreshToken; `secrets/firebase-admin.json` é a service account. NUNCA
   copiar para docs/AGENTS. Referenciar só caminhos.

## Comandos operacionais

```bash
# Testes (roda da raiz, pega conftest.py)
.venv/bin/python -m pytest -q          # 45 testes (parser + roster-sync)

# Parser: dry-run de um demo (não toca Firebase)
.venv/bin/python -m demo_parser demo /path/to/match.dem

# Rebuild das imagens locais (o deploy fica em /opt/docker)
#  parser:   cd demo-parser && docker build -t mamometro-parser:local .
#  roster:   cd roster-sync && docker build -t mamometro-roster-sync:local .
```

Para comandos do deploy (profiles, gluetun, cron, recuperação de demos via
demo-log.csv), ver o AGENTS.md do repo `/opt/docker`.

## Fluxo de trabalho com o upstream

- `origin` = `vcalil/mamometroCS` (colaborador direto, PRs normais).
- `myfork` = `guuilp/mamometroCS` (fork de trabalho; push de branches de PR).
- PRs abertos: #7 (remove watchdog), #8 (transação estado/matches).
- O downloader é repo SEPARADO (fork do Claabs) — mudanças de downloader NÃO
  vão para cá.
