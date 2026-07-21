# Deploy do Mamômetro CS (a partir deste .zip)

Você recebeu o projeto **já configurado** (o arquivo `.env` com a config do
Firebase e a chave da Steam já vem junto). Só falta publicar no Netlify.

> Precisa ter o **Node 20+** instalado (https://nodejs.org).

## Passos (Netlify CLI — inclui as funções)

Abra um terminal na pasta do projeto (onde está o `package.json`) e rode:

```bash
npm install                              # baixa as dependências
npx netlify login                        # abre o navegador pra logar no Netlify
npx netlify deploy --build --prod        # builda e sobe o site + funções
#   → escolha "Create & configure a new site" e dê um nome
```

Agora suba as variáveis das **funções** (chave da Steam etc.) e faça o deploy de
novo pra elas valerem:

```bash
npx netlify env:import .env              # manda as variáveis do .env pro Netlify
npx netlify deploy --build --prod        # redeploy pra as funções pegarem as chaves
```

## Último passo (login)

No console do Firebase (https://console.firebase.google.com), no projeto cuja
config está no `.env` (veja `VITE_FIREBASE_PROJECT_ID`):

> Authentication → **Sign-in method** → habilite **Email/Senha**.

Sem isso, ninguém consegue criar senha / entrar.

## Mais dois passos no Firebase (pegadinhas comuns)

1. **Autorizar o domínio.** Authentication -> Settings -> Dominios autorizados
   -> adicione o dominio do site (ex.: `seu-site.netlify.app`, sem https://).
   Sem isso o login funciona em localhost e falha em producao.

2. **Fechar as regras do banco.** Realtime Database -> Regras -> cole o
   conteudo de `firebase-rules.json` -> Publicar. O "modo de teste" deixa o
   banco aberto pra internet inteira E expira numa data fixa, derrubando o
   site sem aviso quando vence.

## Pronto!

Abra a URL que o Netlify mostrou. Teste:
- **Como funciona** (topo) → guia.
- **Entrar → Cadastrar** com seu perfil da Steam + senha.
- Os organizadores (Vini e Iago) ganham o botão **Organizador**.

---

### Observações
- A config do Firebase é pública por natureza (vai pro navegador de qualquer
  jeito) — por isso pode vir no `.env`. A **chave da Steam** é o segredo de
  verdade; ela fica só no `.env` (que você não deve subir pra nenhum lugar
  público) e nas variáveis do Netlify.
- O `.cfg` do GSI (kills/dano automático) é gerado no próprio painel, já com a
  URL do site publicado. Veja o `README.md` pra detalhes.
- Rodar local antes de publicar (opcional): `docker compose up --build` e abra
  http://localhost:8888.
