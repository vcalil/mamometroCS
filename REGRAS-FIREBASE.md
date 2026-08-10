# Regras do Realtime Database — o porquê de cada uma

O arquivo `firebase-rules.json` é colado **como está** no console
(Realtime Database → Regras → Publicar). Ele não tem comentários de propósito:
o Firebase lê cada chave como um caminho do banco, e `/` é caractere inválido
em nome de nó — uma chave `"//"` faz o console recusar com *syntax error*.
Por isso a documentação mora aqui.

## Princípio

A interface esconde botões; **as regras é que decidem**. Tudo que a tela
promete (papéis, votação, aprovação) está refletido aqui — senão seria teatro.

## Papéis

`papeis/<steamid>` guarda `"master"` ou `"organizador"`. Quem não está no nó é
usuário comum. O SteamID sai do e-mail sintético do login
(`<steamid>@mamometro.gg`), daí o `replace('@mamometro.gg', '')` nas regras.

| Nó | Quem escreve | Por quê |
|---|---|---|
| `papeis` | master (tudo) / organizador (só cria um `organizador` novo) | ver "limite conhecido" abaixo |
| `estado/players` | qualquer conta | é o vínculo de card no primeiro login |
| `estado/matches` | organizador e master | lançar partida é rotina diária |
| `estado/meta` | **só master** | a meta é decisão de assembleia, não de um organizador |
| `seasons` | só master | calendário do CS2 |
| `submissoes` | qualquer conta cria; organizador/master aprova | fila de partidas da galera |
| `propostas` | qualquer conta cria; ver abaixo | votação |
| `gsi/*` | aberto | o CS2 não faz login (ver "GSI") |
| `roster/{steamid}` | ninguém pelo cliente (`write:false`) — só o Admin SDK via `/api/onboard` | o onboard grava o `authCode` (segredo); leitura **só do próprio dono** |
| `matches/{fp}` · `pipeline/status/` | só o Admin SDK (serviços Python na VPS) | pipeline de demos; o cliente nem lê (raiz negada) |

Ler qualquer coisa exige conta. A raiz é negada por padrão, então nenhum
caminho novo nasce aberto por acidente. Os nós do pipeline (`matches/`,
`pipeline/status/`) são escritos pelo **Admin SDK**, que ignora estas regras;
por isso não precisam de `.write` aqui — mas o `roster/` precisa, pra travar a
leitura ao dono. Forma dos dados: ver [`SCHEMA-RTDB.md`](SCHEMA-RTDB.md).

## Voto: permissão por campo, não por nó

No Realtime Database a permissão de escrita **cascateia**: liberar um nó libera
tudo abaixo dele. Se `propostas/$id` fosse gravável pelo organizador, ele
poderia escrever `votos/<outro>` e forjar o voto de outra pessoa.

Por isso `$id` só permite **criar** (`!data.exists()`), e os campos que mudam
depois são liberados um a um:

- `votos/$steamid` → só organizador, e só quando `$steamid` é o dele
- `status`, `aplicadaEm`, `aplicadaPor` → organizador ou master

## Limite conhecido (e por que ele existe)

As regras **não sabem contar votos**. Não há como o banco verificar "essa
promoção teve maioria". Como a decisão foi que a maioria aplica a promoção
sozinha, o organizador precisou de escrita em `papeis` — restrita ao mínimo:

- só cria um `organizador` **novo** (`!data.exists()`)
- nunca cria `master`
- nunca altera nem remove quem já tem papel

Pior caso, se alguém chamar o banco direto pulando a interface: **um
organizador a mais**, que qualquer master remove, com registro de quem propôs
e quem votou. Meta, papéis existentes e temporadas continuam fora do alcance.

## GSI

`gsi/live` e a criação em `gsi/pending` aceitam escrita sem login porque quem
envia é o CS2 do jogador, que não tem conta. A function confere o `GSI_TOKEN`
antes de gravar, e as regras validam o formato. Ler e apagar pendências exige
conta. O estrago possível é entulhar resultados pendentes — que não entram no
ranking sem alguém aprovar.
