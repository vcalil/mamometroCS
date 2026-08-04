# Demo Downloader (VPS)

Watches the Steam account's shared matches and drops the `.dem` files into a
folder that [`demo-parser`](../demo-parser) picks up.

This is the **F0** scaffold: the compose service is wired and the config
template ships, but the actual end-to-end pipeline (watcher, parser, Firebase
writes) lands in later milestones. The bot is fine to run on its own — it
just downloads files.

## 1. Conta descartável do bot

Crie uma **conta Steam nova**, só para isso. Não use a sua conta pessoal.

1. Registre em [store.steampowered.com/join](https://store.steampowered.com/join).
2. Ative o **Steam Guard mobile authenticator** pelo app do celular
   (Steam → menu → Guard de Steam → Adicionar autenticador).
3. **A conta precisa estar com o inventário público** senão o downloader não
   consegue resolver certos endpoints. Configurações do perfil → privacidade
   → "Meu inventário" → Público.

> A Steam às vezes restringe contas novas com Guard recém-ativado. Se a
> autenticação do bot falhar nos primeiros dias, espere 7-15 dias e tente
> de novo — é uma mitigação anti-abuso deles, não bug nosso.

## 2. Exportar o `shared_secret` (.maFile)

O bot precisa do `shared_secret` para gerar os códigos TOTP do Guard sem
intervenção humana.

1. Instale o **Steam Desktop Authenticator** (SDA) em uma máquina desktop.
   Repo: [SteamDesktopAuthenticator](https://github.com/Jessecar96/SteamDesktopAuthenticator).
2. Faça login na conta do bot pelo SDA e conclua o setup do Guard.
3. O SDA cria uma pasta `maFiles/` com um arquivo `<steamId64>.maFile`. Esse é
   o arquivo que você precisa.
4. Abra o `.maFile` em um editor de texto. O campo `shared_secret` é a string
   em **base64** que vai no `config.json` em `authCodeLogin.secret`.

> **Não compartilhe o `.maFile`.** Ele dá acesso à conta sem precisar da senha.

## 3. Chave da Steam Web API

1. Com a conta do bot (ou com a sua — a chave é por domínio, não por conta),
   pegue uma chave em
   [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).
2. Coloque em `steamApiKey` no `config.json`.

Sem essa chave o downloader não consegue resolver share-codes antigos.

## 4. Configurar o `config.json`

```bash
cp config.example.json config/config.json
$EDITOR config/config.json
```

Preencha:

- `authCodeLogin.username` / `.password` / `.secret`
- `steamApiKey`
- `authCodes` — uma entrada por jogador (próximo passo)

## 5. Onboarding de um jogador

Cada jogador que quiser que o bot baixe as partidas dele precisa de três
coisas:

1. **SteamID64** — em [steamid.io](https://steamid.io/) a partir do perfil.
2. **Game Authentication Code** (válido por tempo limitado):
   - Abra [help.steampowered.com/en/wizard/HelpWithGameIssue](https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128)
     (appid 730 = CS2, issueid 128 = "I need a game authentication code").
   - Faça login com a conta **do jogador** (não com a do bot).
   - Copie o código de 5 caracteres (formato `AAAA-11111-BBBBB`).
3. **Share-code mais recente que o bot já viu** (`oldestShareCode`):
   - No CS2, fim de partida → "Watch" → "Suas Partidas".
   - Copie o share-code da partida **mais antiga** que o bot já tiver. Se for
     a primeira vez, pode ser o share-code da partida mais recente mesmo.

> Os códigos são sensíveis: tratam-se de credenciais temporárias. **Nunca**
> commite o `config/config.json` com valores reais — só o `config.example.json`
> entra no repositório.

## 6. Subir com Docker Compose

Já vem configurado em [`docker-compose.yml`](../docker-compose.yml). O
serviço monta:

- `./demo-downloader/config:/config` — o `config.json` que você editou.
- `./demo-downloader/demos:/demos` — onde os `.dem` caem. O `demo-parser`
  lê dessa pasta (read-only).

```bash
docker compose up -d demo-downloader
docker compose logs -f demo-downloader
```

## 7. Variáveis de ambiente (compose)

- `TZ=America/Sao_Paulo` — fuso horário dos logs e do agendamento.

Tudo o que é segredo fica em `config/config.json` (montado por volume, não em
env vars do compose).

## O que NÃO está em F0

- O `demo-parser` ainda é stub: ele aceita `--demo <arquivo>` para teste, mas
  não tem watcher nem grava no Firebase. Isso entra nos próximos marcos.
- O downloader já roda sozinho — é só ele que importa para esta fase.

## Solução de problemas

- **`InvalidPassword` no login do bot** — geralmente o Guard ainda está em
  cooldown pós-ativação. Veja seção 1.
- **`NoMatch` mesmo com share-code válido** — o share-code expira. Gere um
  novo no CS2 e atualize `oldestShareCode` no `config.json`.
- **Pastas vazias em `/demos`** — cheque `docker compose logs demo-downloader`.
  Erros de parsing do `config.json` aparecem logo no boot.
