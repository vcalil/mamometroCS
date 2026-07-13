<h1 align="center">Mamômetro CS 🍼</h1>

<p align="center">
  <b>O ranking oficial das mamadas.</b><br>
  Antes de jogar CS2, a galera combina uma <b>meta</b>. Quem <b>não bate</b> a meta
  “mama” quem bateu — e isso vira ponto no ranking. 😈
</p>

<p align="center">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-Vanilla%20JS-646CFF?logo=vite&logoColor=white">
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-Realtime%20DB%20%2B%20Auth-FFCA28?logo=firebase&logoColor=black">
  <img alt="Netlify" src="https://img.shields.io/badge/Netlify-Functions-00C7B7?logo=netlify&logoColor=white">
  <img alt="Steam" src="https://img.shields.io/badge/Steam-Web%20API%20%2B%20GSI-1b2838?logo=steam&logoColor=white">
</p>

---

## ✨ O que tem

- 🏆 **Ranking ao vivo** — pódio da vergonha + classificação geral, sincronizado pra todos (Firebase).
- 🎯 **Meta editável** — padrão 15 kills e 1500 de dano; o site julga sozinho quem bateu.
- 🔒 **Login por Steam + senha** — o site é fechado: só quem entra vê o ranking. Cada um aparece com seu avatar.
- 🎮 **Kills/dano de 3 jeitos** — na mão, importando um JSON, ou **automático via GSI** (o CS2 manda sozinho).
- 🛡️ **Admins** — só Vini e Iago (por SteamID) abrem o painel do organizador.
- 🐳 **Roda local com Docker** e faz **deploy no Netlify** num clique.

## 🧰 Stack

Vite (Vanilla JS, sem framework) · Firebase (Realtime Database + Authentication) ·
Netlify Functions (Steam Web API + GSI) · Docker (dev local).

## Como rodar localmente

São três jeitos — todos servem também a function do Steam. Antes de qualquer um,
copie o `.env`:

```bash
cp .env.example .env    # e preencha os valores (veja a seção Variáveis)
```

**1. Docker (recomendado pra testar como fica pronto)**

```bash
docker compose up --build
# abra http://localhost:8888
```
O container builda o site e sobe um servidor Node que serve a página **e** a
function do Steam. As variáveis vêm do `.env` automaticamente.

**2. Node direto (sem Docker), igual ao Docker**

```bash
npm install
npm run build
npm run start           # http://localhost:8888
```

**3. Modo dev com hot-reload (Netlify CLI)**

```bash
npm install
npm run dev             # netlify dev: Vite + Functions juntos
```

> Se rodar só o Vite (`npm run vite`), o ranking funciona, mas o botão
> "Buscar da Steam" não responde (a function não sobe nesse modo).

## Docker & Netlify — importante

O **Netlify não faz deploy de container Docker** (a plataforma é estática +
serverless functions). Por isso o Docker aqui serve **só pra rodar/testar
localmente**. O deploy no Netlify continua sendo pelo Git (veja abaixo) — os dois
caminhos usam o mesmo código da function (`netlify/functions/steam-profile.js`).

## Variáveis de ambiente (`.env`)

| Variável | Onde usar | O que é |
|---|---|---|
| `VITE_FIREBASE_*` | navegador | Config web do Firebase (é pública por natureza; a proteção real são as **regras** do Realtime Database) |
| `VITE_ADMIN_STEAMIDS` | navegador | SteamIDs dos organizadores (Vini, Iago), separados por vírgula. Quem logar com esses perfis ganha o botão "Organizador" |
| `STEAM_API_KEY` | **só servidor** (sem prefixo `VITE_`) | Chave da Steam Web API |
| `GSI_TOKEN` / `VITE_GSI_TOKEN` | servidor / navegador | Token do GSI — **mesmo valor** nos dois |
| `FIREBASE_DATABASE_URL` | **só servidor** | Onde a função GSI grava as pendências |

### Chave da Steam (e o campo "Domain Name")

Pegue a chave em <https://steamcommunity.com/dev/apikey> (precisa estar logado na
sua conta Steam — só você consegue gerar a sua chave).

A página pede um **Domain Name**. Esse campo é só um rótulo do acordo de uso: a
Steam **não restringe** as chamadas da Web API por domínio, então a mesma chave
funciona em `localhost` e no seu site do Netlify. Pode preencher com `localhost`
(ou qualquer domínio, ex.: o do Netlify). Depois cole em `STEAM_API_KEY` no
`.env` e teste em <http://localhost:8888>.

## Adicionar jogador pela Steam

No painel do organizador → aba **Jogadores** → **Adicionar da Steam**: cole a URL
do perfil (`steamcommunity.com/id/...` ou `/profiles/...`) ou o SteamID64. O site
busca **nome, avatar e SteamID** oficiais (só leitura, não mexe nos dados do
jogador). Também dá pra adicionar jogador só pelo nome, sem Steam.

## Login dos jogadores (contas)

**O site é fechado por login:** quem não está logado cai direto na tela de
**Entrar / Cadastrar** e só vê o ranking depois de entrar.

Cada jogador entra com o **perfil da Steam + uma senha própria**. A identidade é
a Steam; a senha é guardada com segurança pelo **Firebase Authentication**
(Email/Senha) — **fora** do banco público, então nunca fica exposta. O "email" é
sintético, derivado do SteamID (`<steamid>@mamometro.gg`), e nenhum email é
enviado.

**Ative o provedor uma vez** no console do Firebase:
> Authentication → **Sign-in method** → habilite **Email/Senha**.

Fluxo:
- **Cadastrar**: cola o perfil da Steam + escolhe senha → o site pega avatar/nome
  oficiais e cria a conta. Depois pede **qual card é você**: reivindica um
  jogador antigo (ex.: o "Iago" que já existia) **ou** cria um card novo.
- **Entrar**: perfil da Steam + senha.
- Estar logado **só identifica** (aparece com avatar). Quem lança as partidas
  continua sendo o **organizador**.

**Organizadores (admins):** são os SteamIDs em `VITE_ADMIN_STEAMIDS` (Vini e
Iago). Eles entram com a Steam como qualquer jogador e, por estarem na lista,
ganham o botão **"Organizador"** que abre o painel. Não há mais senha de admin
separada. Na plataforma, o botão **"Como funciona"** (topo) explica tudo pros
jogadores, e a aba **Ajuda** dentro do painel explica pros organizadores.

**Admin pré-cadastra, jogador cria a senha depois:** o organizador pode adicionar
o jogador na aba **Jogadores → Adicionar da Steam**. Depois, essa pessoa entra em
**Entrar → Cadastrar** com o mesmo perfil, **escolhe a senha** e cai direto no card
que o admin criou (casado pelo SteamID) — não precisa reivindicar nada.

## Meta e partidas

A **meta** (padrão: **15 kills e 1500 de dano**) é editável pelo organizador na
aba **Nova partida**. Ao lançar uma partida, o admin **digita kills e dano de
cada jogador** e o site decide sozinho quem **bateu a meta** (≥ kills **E** ≥
dano) — quem não bateu "mama" quem bateu. A meta usada fica registrada em cada
partida no histórico.

> Por que digitar na mão? A API oficial da Steam **não fornece kills nem dano por
> partida** de CS2 (esses números só existem dentro da demo `.dem` da partida).
> Testado: `GetPlayerSummaries` só dá perfil, `GetUserStatsForGame` volta vazio e
> `GetNextMatchSharingCode` é bloqueado/só dá códigos, não estatísticas.

## Kills e dano: dois caminhos

**1. Manual (admin):** na aba **Nova partida** o organizador digita kills/dano de
cada um. Sempre funciona, zero setup.

**1b. Import por JSON (admin):** na mesma aba, dá pra **subir um `.json`** (ou colar
o texto) e preencher time + kills + dano de uma vez. Casa cada entrada por
**SteamID** ou **nome**; quem não bater aparece num aviso. Formato aceito (array
puro ou objeto):
```json
{
  "date": "2026-07-13",
  "meta": { "kills": 15, "damage": 1500 },
  "players": [
    { "name": "Charlinho", "kills": 18, "damage": 2100 },
    { "steamId": "7656119XXXXXXXXXX", "kills": 9, "damage": 1200 }
  ]
}
```

**2. Automático via GSI (Game State Integration):** oficial da Valve, seguro
contra anti-cheat. Cada jogador instala **um arquivo** e o CS2 passa a enviar
kills e dano ao fim de cada partida.

Como funciona: o `.cfg` aponta pra função `/.netlify/functions/gsi`. Durante a
partida o CS2 faz POST do estado; a função acumula **kills** (`match_stats.kills`)
e **dano** (soma do `round_totaldmg` de cada round) do **jogador local** e, no fim,
grava um resultado em `gsi/pending`. No painel do admin (aba **GSI**) os resultados
aparecem, e na aba **Nova partida** cada jogador do time ganha um botão **“usar”**
que preenche kills/dano automaticamente (o admin confirma e salva).

Instalar (cada jogador, uma vez):
1. Painel do organizador → aba **GSI** → **Baixar arquivo .cfg** (já vem com a URL
   do site certa). Ou use `gsi/gamestate_integration_mamometro.cfg` do repositório
   e troque a URL.
2. Coloque em `.../Counter-Strike Global Offensive/game/csgo/cfg/`.
3. Reinicie o CS2.

Limites honestos: só captura as partidas **de quem instalou** e só as **futuras**
(não é retroativo); e como o CS2 posta durante o jogo, precisa do site **publicado**
(ou o CS2 rodando na mesma máquina que o `localhost`).

Variáveis: `GSI_TOKEN` (função) e `VITE_GSI_TOKEN` (cliente) devem ter o **mesmo**
valor; `FIREBASE_DATABASE_URL` diz à função onde gravar as pendências.

## Deploy (Netlify) — passo a passo

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/vcalil/mamometroCS)

**Antes:** ative o provedor de login uma vez no Firebase
(Authentication → Sign-in method → **Email/Senha**).

1. **Suba o código pro GitHub** (repo privado serve). O `.env` **não** vai (está
   no `.gitignore`) — as variáveis entram no painel do Netlify no passo 4.
2. No **Netlify** → **Add new site → Import from Git** → escolha o repositório.
   Build e publish já vêm do `netlify.toml` (`npm run build`, pasta `dist`,
   functions em `netlify/functions`). Só confirmar.
3. **Não conclua ainda** — vá em **Site configuration → Environment variables**.
4. Cadastre estas variáveis (copie os valores do seu `.env`):
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
     `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`,
     `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
     `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_ADMIN_STEAMIDS` = `7656119XXXXXXXXXX,76561198119763313` (Vini, Iago)
   - `STEAM_API_KEY` = sua chave da Steam
   - `GSI_TOKEN` e `VITE_GSI_TOKEN` = **mesmo** valor (ex.: `mamometro-gsi`)
   - `FIREBASE_DATABASE_URL` = a mesma URL do banco
5. **Deploys → Trigger deploy → Deploy site** (pra pegar as variáveis).
6. Pronto. Teste no domínio do Netlify:
   - **Como funciona** (topo) abre o guia; **Entrar → Cadastrar** cria conta.
   - Logue como Vini/Iago → aparece o botão **Organizador**.
   - Functions ativas: `/.netlify/functions/steam-profile` e `/.netlify/functions/gsi`.
7. **GSI (opcional):** cada jogador baixa o `.cfg` na aba GSI do painel (já vem
   com a URL do site publicado) e põe em `.../csgo/cfg/`.

> Domínio: o Netlify dá um `*.netlify.app`. Se trocar por domínio próprio depois,
> nada muda no código — o `.cfg` do GSI é gerado com a URL atual do site.

### Um amigo pode fazer o deploy do meu repo?

**Sim** — se o repositório for público (ou você der acesso), qualquer um consegue
conectar ele no Netlify. Mas tem detalhes importantes:

- **Vai pro Netlify DELE, não pro seu.** Ele cria um site na conta Netlify dele,
  com **outra URL** (`*.netlify.app` diferente). Não é o "seu" site.
- **Precisa das variáveis de ambiente.** O `.env` **não está no repo** (segredos
  ficam de fora). Sem preencher as variáveis (Firebase, `STEAM_API_KEY`, etc.) no
  painel do Netlify dele, o site builda mas **não funciona** (não conecta no banco
  nem na Steam). Ou seja: o repo sozinho não vaza suas chaves. ✅
- **Se ele usar as SUAS variáveis** (mesmo Firebase + mesma chave Steam), o site
  dele aponta pro **mesmo banco** — mesmos dados, mesmo ranking, dois endereços.
  Se ele usar um Firebase próprio, vira um mundo separado (dados zerados).

**Quer que um amigo mexa/faça deploy do SEU site de verdade** (mesma URL, mesma
conta)? Aí não é "subir o repo": você adiciona ele como **membro do seu time no
Netlify** (Team settings → Members). Aí ele administra o site junto com você.

Resumindo: repo público = qualquer um faz a **própria cópia** (precisa das chaves
pra funcionar); pro seu site oficial, é convite de time no Netlify.

## Estrutura

```
index.html                    # markup + carrega src/main.js
src/
  main.js                     # bootstrap, wiring do Firebase, handlers globais
  firebase.js                 # config via import.meta.env
  state.js                    # estado (dados), salvar(), helpers
  stats.js                    # cálculo do ranking
  steam.js                    # cliente da Netlify Function (Steam)
  gsi-client.js               # pendências do GSI + geração do .cfg
  auth.js                     # login dos jogadores (Firebase Auth Email/Senha via Steam)
  ui/render.js                # visualizador (pódio + classificação)
  ui/admin.js                 # painel do organizador + integração Steam
  ui/conta.js                 # UI de entrar/cadastrar + reivindicar card + botão Organizador
  ui/ajuda.js                 # guia público "Como funciona"
  ui/setup.js                 # tela quando o Firebase não está configurado
  styles.css
netlify/functions/steam-profile.js   # backend Steam (ResolveVanityURL + GetPlayerSummaries)
netlify/functions/gsi.js             # recebe o GSI do CS2 e acumula kills/dano
gsi/gamestate_integration_mamometro.cfg  # .cfg de referência (o painel gera com a URL certa)
server.js                     # servidor local (Docker / npm run start): site + function
Dockerfile                    # build do site + runtime enxuto (Node)
docker-compose.yml            # docker compose up --build -> localhost:8888
```

## Fora de escopo (fase futura)

Importar partidas de CS2 automaticamente e julgar a meta sozinho: não há API
oficial simples pra scoreboard de CS2 — dependeria de serviço terceiro
(csstats.gg etc.) ou match-sharing codes + Game Coordinator. Fica pra depois.
