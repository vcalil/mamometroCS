# Deploy do Mamômetro CS (self-hosted / Docker)

Você recebeu o projeto **já configurado** (o `.env` com a config do Firebase e a
chave da Steam vem junto). O deploy é **self-hosted em Docker** (a infra do
guuilp) — o Netlify foi descontinuado.

> Precisa de **Docker** + **Docker Compose** na máquina/VPS.

## Subir o site

Na pasta do projeto (onde está o `docker-compose.yml`):

```bash
docker compose up --build -d mamometro   # builda e sobe o site (server.js) na :8888
```

O `server.js` serve o SPA (`dist/`) e as funções em **`/api/steam-profile`**,
**`/api/gsi`**, **`/api/onboard`** (o path legado `/.netlify/functions/*` ainda
responde, pra `.cfg` de GSI antigos). Coloque um proxy (Traefik/Nginx) na frente
pro domínio + HTTPS.

## Pipeline de demos (bot) — serviços opcionais

```bash
docker compose up --build -d demo-downloader demo-parser roster-sync
```

Precisa do service-account do Firebase em `demo-parser/secrets/firebase-admin.json`
(e `roster-sync/secrets/...`) e das `STEAM_BOT_*` no `.env`. Ver `README.md`.

## Firebase (uma vez, no console)

No projeto do `.env` (`VITE_FIREBASE_PROJECT_ID`):

1. **Login:** Authentication → Sign-in method → habilite **Email/Senha**.
2. **Domínio:** Authentication → Settings → Domínios autorizados → adicione o
   domínio do site (sem `https://`). Sem isso o login falha em produção.
3. **Regras:** Realtime Database → Regras → cole `firebase-rules.json` → Publicar.
   (O "modo de teste" abre o banco pra internet e expira sozinho.)

## Verificar

- Abra o domínio: **Entrar** com a Steam → cai no **gate de onboarding** (cola os
  2 códigos do CS2). Depois vê o ranking.
- `/api/steam-profile?input=...` e `/api/onboard` respondem JSON.

---

## ⚠️ Pendências de validação (guuilp) — refactor de padronização

Duas coisas do refactor Python (Fase 3) **precisam ser validadas na VPS** — o lado
Python foi validado local, mas não dá pra buildar/rodar Docker fora da infra:

1. **`docker compose build`** dos serviços `demo-parser` e `roster-sync`: o build
   `context` virou a **raiz do repo** (pra a imagem incluir o pacote compartilhado
   `mm_common/`). Confirmar que as 3 imagens buildam e sobem (`python -m demo_parser`
   / `python -m roster_sync`).
2. **`watchdog`**: o código está pronto (Dockerfile com `mm_common`, usa `env_int`),
   mas **não foi wirado no `docker-compose.yml`** — falta um serviço
   `docker-socket-proxy` (acesso ao socket do Docker é decisão de infra). Wirar
   quando for ativar.

## Observações

- A config do Firebase é pública (vai pro navegador) — por isso vem no `.env` e é
  injetada no build via `%VITE_FIREBASE_*%`. A **chave da Steam** é o segredo real:
  fica só no `.env` (não suba pra lugar público) e nas envs dos containers.
- O `.cfg` do GSI é gerado no painel, já com a URL `.../api/gsi`.
