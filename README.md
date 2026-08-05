<div align="center">

# 🍼 Mamômetro CS

**O ranking oficial das mamadas.**

Antes de jogar CS2, a galera combina uma **meta**. Quem **não bate** "mama" todo mundo que bateu — e isso vira ponto no ranking. 😈

![Vite](https://img.shields.io/badge/Vite-Vanilla%20JS-646CFF?logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB%20%2B%20Auth-FFCA28?logo=firebase&logoColor=black)
![Netlify](https://img.shields.io/badge/Netlify-Functions-00C7B7?logo=netlify&logoColor=white)
![Steam](https://img.shields.io/badge/Steam-Web%20API%20%2B%20GSI-1b2838?logo=steam&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

## O que é

Um placar privado para um grupo de amigos que joga CS2. A cada partida
combina-se uma meta (padrão: **15 kills e 1500 de dano**). Quem fica abaixo
"mama" cada um que atingiu — o site conta essas mamadas, monta o pódio e guarda
o histórico por temporada.

Tudo sincroniza ao vivo: alguém lança a partida e o ranking muda na tela de
todo mundo, sem recarregar.

## ✨ Funcionalidades

- 🏆 **Ranking ao vivo** — pódio, barras e detalhe de quem mamou quem
- 🔄 **Duas visões** — quem mais mamou × quem mais foi mamado
- 📅 **Temporadas** seguindo o calendário do Premier, com histórico por season
- 🔒 **Login pela Steam** (perfil + senha), com avatar e nome oficiais
- 📤 **Envio aberto** — qualquer um manda a partida; um organizador aprova
- 🎮 **Três formas de lançar** — na mão, por JSON ou automático pelo CS2 (GSI)
- ✅ **Conferência das kills** pelo Leetify
- 👑 **Papéis** (comum / organizador / master) com permissão real no banco
- 🗳️ **Assembleia** — sugestões o ano todo, votadas em dezembro

---

## 🏗 Arquitetura

```
navegador (Vite, JS puro)
   │
   ├── Firebase Auth ......... login (e-mail sintético <steamid>@mamometro.gg)
   ├── Realtime Database ..... estado, papéis, submissões, propostas, seasons
   ├── api.leetify.com ....... conferência de kills (CORS liberado)
   │
   └── Netlify Functions
        ├── steam-profile ..... resolve perfil da Steam (a key fica no servidor)
        └── gsi ............... recebe o Game State Integration do CS2
```

Sem framework de front-end: JavaScript modular com `onclick` inline apontando
para funções expostas em `window` (ver `src/main.js`). A escolha foi manter o
protótipo original funcionando enquanto o projeto crescia.

### Por que existem funções serverless

Duas coisas não podem rodar no navegador:

1. **Steam Web API** — a chave não pode ir para o cliente, e a Steam não envia
   cabeçalhos CORS. `steam-profile` faz a chamada no servidor.
2. **GSI** — o CS2 faz `POST` do estado do jogo para uma URL. Ele não tem
   login, então precisa de um endpoint público que valide um token
   compartilhado antes de gravar.

### Estrutura

```
src/
  main.js .......... bootstrap, listeners do Firebase, handlers em window
  firebase.js ...... config vinda das VITE_*
  auth.js .......... login + papéis (master / organizador / comum)
  state.js ......... estado compartilhado e gravações por ramo
  stats.js ......... cálculo do ranking (deu / levou)
  seasons.js ....... temporadas do CS2
  submissoes.js .... fila de partidas aguardando aprovação
  propostas.js ..... votação (promoção, meta, regra)
  leetify.js ....... conferência de kills
  steam.js ......... cliente da function de perfil
  gsi-client.js .... pendências do GSI + geração do .cfg
  ui/
    render.js ...... ranking, pódio, seletor de temporada
    conta.js ....... login, muro de entrada, vínculo de card
    enviar.js ...... envio de partida (aberto a todos)
    aprovacoes.js .. fila do organizador
    assembleia.js .. propostas e votação
    admin.js ....... painel do organizador
    ajuda.js ....... guia dentro do site
netlify/functions/
  steam-profile.js . ResolveVanityURL + GetPlayerSummaries
  gsi.js ........... acumula kills/dano e grava o resultado pendente
```

---

## 🔐 Papéis e permissões

| | comum | organizador | master |
|---|---|---|---|
| Ver o ranking (exige conta) | ✅ | ✅ | ✅ |
| Enviar partida | ✅ | ✅ | ✅ |
| Sugerir na assembleia | ✅ | ✅ | ✅ |
| Lançar/aprovar partida | — | ✅ | ✅ |
| **Votar** | — | ✅ | ❌ |
| Promover organizador | — | por maioria | direto |
| Alterar a meta | — | — | aplicando o que a votação decidiu |
| Papéis e temporadas | — | — | ✅ |

O **master não vota** por decisão de projeto: fica fora da assembleia para não
desequilibrar a votação, mas pode decidir qualquer pauta diretamente quando ela
empaca.

As permissões são impostas pelas **regras do Realtime Database**, não apenas
escondendo botões — ver [`REGRAS-FIREBASE.md`](REGRAS-FIREBASE.md) para o porquê
de cada uma e os limites conhecidos.

---

## 🎮 Como uma partida entra no ranking

```
qualquer um envia → fila de submissões → organizador aprova → ranking
```

A partida aprovada guarda **quem enviou, quando, quem aprovou e quando**.

### As três formas de preencher

**1. Na mão** — monta o time e digita kills e dano; o ✅/❌ mostra na hora quem
bateu a meta.

**2. Por JSON** — sobe um arquivo ou cola o texto:

```json
{
  "date": "2026-07-20",
  "players": [
    { "name": "Fire", "kills": 18, "damage": 2100 },
    { "steamId": "7656...", "kills": 9, "damage": 1200 }
  ]
}
```

O `name` casa com o elenco (maiúsculas não importam); `steamId` é mais seguro
contra apelido trocado.

**3. Automático (GSI)** — o jogador instala um `.cfg` na pasta do CS2 e o jogo
passa a enviar kills e dano ao fim de cada partida. O painel gera o arquivo já
com a URL do site (para baixar ou copiar o texto).

O CS2 não expõe "dano total da partida" — só `round_totaldmg`, do round atual.
A função guarda o maior valor visto em cada round e soma no fim. As kills vêm de
`match_stats.kills`, que já é acumulado.

> **Custo:** cada jogador com o `.cfg` gera requisições durante a partida. O
> `throttle` está em `2.0` (~7.500 invocações por partida com 10 jogadores),
> bem abaixo das 125.000/mês do plano gratuito do Netlify.

---

## ✅ Conferência pelo Leetify

Ao enviar, o site consulta a API pública do Leetify e compara as **kills**
declaradas com o histórico de quem tem perfil por lá:

| Selo | Significado |
|---|---|
| 🟢 confere | bateu com o declarado |
| 🟡 ambíguo | houve mais de uma partida naquele dia |
| 🔴 diverge | número diferente |
| ⚪ sem dados | sem perfil ou sem partida no dia |

**Limites medidos na API, não supostos:**

- `gameFinishedAt` tem precisão de **dia**, sem hora. Como é comum jogar várias
  partidas no mesmo dia, a validação mostra **todos os candidatos** em vez de
  escolher um — validação que chuta é pior que validação nenhuma.
- O **dano não é público** (fica atrás de `isSensitiveDataVisible`), então só as
  kills são conferidas.
- Se a API falhar ou demorar, o envio segue normalmente. A conferência é um
  extra e nunca trava ninguém.

> **Por que não csstats.gg:** não há API pública e o site responde `403` com
> desafio do Cloudflare. Passar por ali exigiria burlar proteção anti-bot —
> frágil, contra os termos deles, e quebraria sem aviso.

---

## 📅 Temporadas

A Valve **não expõe** o calendário do Premier por API — as datas saem de
anúncios. O projeto já vem com as conhecidas, e o master adiciona a próxima
quando for divulgada:

| Season | Início | Fim |
|---|---|---|
| Season 3 | 15/07/2025 | 19/01/2026 |
| Season 4 | 20/01/2026 | 05/07/2026 |
| Season 5 | 06/07/2026 | ~05/01/2027 *(estimado)* |

Fins não confirmados aparecem marcados como estimados na interface.

---

## 🚀 Rodando o seu

### 1. Firebase

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com) (pode dispensar o Analytics)
2. **Build → Realtime Database → Criar banco** — ⚠️ *Realtime Database*, **não** Firestore. Comece em modo de teste; as regras entram no passo 5
3. **Authentication → Começar → Sign-in method → Email/Senha → Ativar**
4. ⚙️ **Configurações do projeto → Seus apps → `</>`** e registre um app web

> Crie o banco **antes** de registrar o app, senão a config vem sem
> `databaseURL`.

### 2. Chave da Steam

Pegue em [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).
Ela fica **só no servidor** — nunca com prefixo `VITE_`.

### 3. Variáveis

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

VITE_SITE_URL=https://seu-site.netlify.app   # o .cfg do GSI aponta pra cá
VITE_ADMIN_STEAMIDS=7656...,7656...          # semente de master

STEAM_API_KEY=...                            # servidor, nunca VITE_
GSI_TOKEN=algum-token                        # igual nos dois
VITE_GSI_TOKEN=algum-token
FIREBASE_DATABASE_URL=...                    # usada pela function do GSI
```

A config do Firebase é pública por natureza (vai para o navegador de qualquer
forma) — a proteção real são as regras do banco. A chave da Steam é o segredo de
verdade.

### 4. Deploy no Netlify

```bash
npm install
npx netlify login
npx netlify sites:create --name seu-site
npx netlify env:import .env          # ANTES do build
npx netlify deploy --build --prod
```

> Importe as variáveis antes do primeiro build: as `VITE_*` são embutidas em
> tempo de compilação, e sem elas o site nasce sem configuração.

### 5. Fechar o banco

Cole [`firebase-rules.json`](firebase-rules.json) em **Realtime Database →
Regras → Publicar**.

O "modo de teste" deixa o banco aberto para a internet inteira **e expira numa
data fixa**, derrubando o site sem aviso quando vence.

Depois crie o nó `papeis` na raiz, ao lado de `estado`:

```json
{ "7656119XXXXXXXXXX": "master" }
```

O valor é o **texto** `master` (ou `organizador`), não booleano.

### 6. Autorizar o domínio

**Authentication → Settings → Domínios autorizados** → adicione
`seu-site.netlify.app`.

Sem isso o login funciona em `localhost` e falha em produção — o que confunde
bastante na hora de investigar.

---

## 💻 Desenvolvimento local

```bash
docker compose up --build     # http://localhost:8888 (site + functions)
```

Ou sem Docker:

```bash
npm install
npm run dev                   # netlify dev: Vite + functions no mesmo host
```

| Script | O que faz |
|---|---|
| `npm run dev` | Vite + Netlify Functions |
| `npm run vite` | só o front |
| `npm run build` | build de produção em `dist/` |
| `npm start` | serve `dist/` + functions (usado no Docker) |

`localhost` já vem autorizado no Firebase Auth. O `.cfg` do GSI usa
`VITE_SITE_URL` mesmo em desenvolvimento — apontar o CS2 para `localhost`
enviaria os dados para a máquina do próprio jogador.

---

## 🗄 Modelo de dados

```
estado/
  players[]   { id, name, steamId?, avatar?, profileUrl? }
  matches[]   { id, date, entries[{from,to}], stats?,
                enviadoPor, enviadoEm, aprovadoPor, aprovadoEm }
  meta        { kills, damage }
papeis/       { <steamid>: "master" | "organizador" }
seasons[]     { id, nome, inicio, fim, fimEstimado? }
submissoes/   { date, entries, stats, autor, origem, validacao, ts }
propostas/    { tipo, titulo, detalhe, valor, autor, votos{}, status, ts }
gsi/
  live/       acumulado da partida em andamento
  pending/    resultados aguardando uso
```

Cada ramo de `estado` é gravado separadamente (`salvarJogadores`,
`salvarPartidas`, `salvarMeta`) porque as permissões diferem por ramo — um
`set()` no nó inteiro seria recusado.

---

## ⚠️ Limitações conhecidas

- **Kills e dano não vêm da Steam.** `GetUserStatsForGame` retorna vazio para
  CS2 e `GetNextMatchSharingCode` responde `403`. Daí o GSI e a entrada manual.
- **O GSI só captura quem instalou o `.cfg`**, e só partidas futuras.
- **O Leetify não expõe dano** no perfil público.
- **As regras não sabem contar votos.** Para a maioria aplicar uma promoção
  sozinha, o organizador tem permissão de criar *um organizador novo* — nunca
  master, nunca alterar ou remover quem já tem papel. É o menor dano possível
  para esse comportamento; detalhes em [`REGRAS-FIREBASE.md`](REGRAS-FIREBASE.md).
- **Um organizador grava partidas diretamente**, por design (é rotina diária).
  A fila de aprovação existe para quem *não* é organizador.

---

## 🛠 Pipeline de demos (VPS) — WIP (F0)

Em paralelo à entrada manual / GSI / Leetify, a ideia é ter um **bot Steam**
numa VPS que baixa as `.dem` automaticamente e um serviço Python que extrai
os stats por jogador, espelhando o que o [`porTotais()`](#-funcionalidades)
faz no front.

- 🤖 **Bot** — `cs-demo-downloader` ([Claabs](https://github.com/Claabs/cs-demo-downloader)),
  imagem [`ghcr.io/claabs/cs-demo-downloader`](https://ghcr.io/claabs/cs-demo-downloader).
  Loga numa conta Steam descartável, varre os share-codes dos jogadores
  cadastrados e grava os `.dem` em `./demo-downloader/demos`.
- 🐍 **Parser** — [`demo-parser/`](demo-parser/), container
  `demo-parser`. Lê os `.dem` com `demoparser2`, calcula o scoreboard final
  (mesmas tick-props do front), filtra por overlap com o roster, deduplica
  por fingerprint e grava em `matches/{id}` no Realtime Database.

**Estado atual (F0):** o esqueleto do compose, o `config.example.json`, o
parser com CLI dry-run e a documentação de setup já estão no repo. O
watcher (F1) e o roteamento Traefik (F2) ainda não.

Setup completo do bot (conta descartável, `.maFile`, chave da API, onboarding
de jogador com share-code): [`demo-downloader/README.md`](demo-downloader/README.md).

---

## 🤝 Contribuindo

O repositório é público, mas o `main` é protegido: contribuições externas entram
por **pull request** e só são mescladas após **aprovação** do mantenedor.

---

## 📄 Licença

MIT — ver [LICENSE](LICENSE).
