import { ref, onValue } from "firebase/database";
import { db, configurado } from "./firebase.js";
import { aplicarSnapshot, resetarCarga } from "./state.js";
import { aoMudarAuth, definirPapeis } from "./auth.js";
import { toggleLinha, trocarVisao, trocarSeason } from "./ui/render.js";
import { mostrarSetup } from "./ui/setup.js";
import * as admin from "./ui/admin.js";
import * as conta from "./ui/conta.js";
import { abrirAjuda } from "./ui/ajuda.js";
import { setPendentes } from "./gsi-client.js";
import { setSubmissoes } from "./submissoes.js";
import { setPropostas } from "./propostas.js";
import { setSeasons } from "./seasons.js";
import * as enviar from "./ui/enviar.js";
import * as aprov from "./ui/aprovacoes.js";
import * as assembleia from "./ui/assembleia.js";

function marcarLive(on) {
  const el = document.getElementById("live");
  if (!el) return;
  el.classList.toggle("on", on);
  document.getElementById("live-txt").textContent = on ? "ao vivo" : "offline";
}

// ---- Expõe os handlers usados nos onclick/onchange inline do HTML ----
// (mantém o markup atual funcionando sem reescrever os atributos)
Object.assign(window, {
  toggleLinha,
  trocarVisao,
  trocarSeason,
  abrirAjuda,
  abrirAdmin: admin.abrirAdmin,
  fecharOverlay: admin.fecharOverlay,
  trocarTab: admin.trocarTab,
  addJogador: admin.addJogador,
  removerJogador: admin.removerJogador,
  mesclarJogadores: admin.mesclarJogadores,
  buscarSteam: admin.buscarSteam,
  confirmarSteam: admin.confirmarSteam,
  limparSteam: admin.limparSteam,
  addAoTime: admin.addAoTime,
  removerDoTime: admin.removerDoTime,
  setStat: admin.setStat,
  salvarMeta: admin.salvarMeta,
  addSeason: admin.addSeason,
  setDataPartida: admin.setDataPartida,
  salvarPartida: admin.salvarPartida,
  removerPartida: admin.removerPartida,
  // importar JSON
  importarJsonArquivo: admin.importarJsonArquivo,
  importarJsonTexto: admin.importarJsonTexto,
  verExemploJson: admin.verExemploJson,
  // GSI
  usarGsi: admin.usarGsi,
  baixarCfgGsi: admin.baixarCfgGsi,
  copiarCfgGsi: admin.copiarCfgGsi,
  descartarGsi: admin.descartarGsi,
  // conta (login/cadastro dos jogadores)
  abrirConta: conta.abrirConta,
  fecharConta: conta.fecharConta,
  trocarTabConta: conta.trocarTabConta,
  fazerCadastro: conta.fazerCadastro,
  fazerEntrar: conta.fazerEntrar,
  reivindicar: conta.reivindicar,
  vincularCard: conta.vincularCard,
  editarApelido: conta.editarApelido,
  // enviar partida (qualquer usuário logado)
  abrirEnviar: enviar.abrirEnviar,
  fecharEnviar: enviar.fecharEnviar,
  trocarTabEnviar: enviar.trocarTabEnviar,
  addAoTimeEnv: enviar.addAoTimeEnv,
  removerDoTimeEnv: enviar.removerDoTimeEnv,
  setStatEnv: enviar.setStatEnv,
  setDataEnv: enviar.setDataEnv,
  usarGsiEnv: enviar.usarGsiEnv,
  confirmarEnvio: enviar.confirmarEnvio,
  importarJsonEnv: enviar.importarJsonEnv,
  aplicarJsonEnv: enviar.aplicarJsonEnv,
  // enviar partida por foto do placar (OCR)
  demArquivo: enviar.demArquivo,
  demBind: enviar.demBind,
  demEditNum: enviar.demEditNum,
  demAplicar: enviar.demAplicar,
  // aprovações (organizador)
  aprovar: aprov.aprovar,
  recusar: aprov.recusar,
  // assembleia (todos) e propostas
  abrirAssembleia: assembleia.abrirAssembleia,
  fecharAssembleia: assembleia.fecharAssembleia,
  enviarSugestao: assembleia.enviarSugestao,
  votarProposta: assembleia.votarProposta,
  proporAdmin: assembleia.proporAdmin,
  decidirMaster: assembleia.decidirMaster,
  aplicarProposta: assembleia.aplicarProposta,
  definirPapel: admin.definirPapel,
  promoverDireto: admin.promoverDireto,
  criarNovoJogador: conta.criarNovoJogador,
  sairConta: conta.sairConta,
});

// ---- Fecha o overlay ao clicar fora do modal ----
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") admin.fecharOverlay();
});

// ---- Bootstrap ----
// F1: estado do gate de onboard. "loading" ate' o check inicial terminar,
// depois "onboarded" ou "not_onboarded". conta.js renderApp() le esse
// state pra decidir o que mostrar (muro de login / gate de onboard / ranking).
window.__mamometroOnboardState = "loading";

// As regras do banco exigem login pra ler `estado` e `gsi/pending`. Se a gente
// assinasse esses nós no carregamento da página (antes do login), o Firebase
// negaria a leitura e CANCELARIA o listener — que não se reinscreve sozinho
// quando a sessão chega. Por isso as assinaturas são amarradas ao login.
if (configurado) {
  onValue(ref(db, ".info/connected"), (s) => marcarLive(!!s.val()));

  let desinscrever = [];
  // Listener do gate de onboard: quando o form submete com sucesso, dispara
  // esse event e a gente re-checa + re-renderiza (libera o gate pro ranking).
  window.addEventListener("mamometro:onboard-done", () => {
    conta.renderApp();
  });

  aoMudarAuth((user) => {
    desinscrever.forEach((fn) => fn());
    desinscrever = [];

    if (!user) {
      // Deslogado: descarta os dados em memória pra não vazar pro próximo.
      aplicarSnapshot({});
      resetarCarga();
      conta.resetarOfertaVinculo();
      window.__mamometroOnboardState = "loading"; // reseta pro próximo login
      conta.renderApp();
      return;
    }

    // F1: checa se o usuario ja fez onboard. Se nao, renderApp() mostra o
    // gate e NAO assina os dados do ranking (economiza bandwidth + força o
    // cara a fazer onboard antes de ver o placar). Import dinamico pra nao
    // pesar o bundle inicial.
    window.__mamometroOnboardState = "loading";
    conta.renderApp(); // mostra "Verificando..."
    import("./ui/onboard.js").then((m) => m.checarOnboard()).then((s) => {
      window.__mamometroOnboardState = s;
      conta.renderApp();
    });

    desinscrever.push(
      onValue(
        ref(db, "estado"),
        (snap) => {
          // F1: SEMPRE carrega os dados do estado, mesmo se o user nao onboarded
          // ainda. O gate de onboard e' so' pro form, nao pros dados — o user
          // pode ver o ranking (com os 10 players) antes de onboardar. O gate
          // que renderApp() desenha em cima quando state != 'onboarded'.
          aplicarSnapshot(snap.val() || {});
          marcarLive(true);
          if (window.__mamometroOnboardState === "onboarded") {
            conta.renderApp(); // so re-renderiza se j'a onboarded (senao o gate fica)
            // Logado sem card do histórico? Oferece o vínculo (uma vez).
            conta.garantirVinculo();
            // Se o painel estiver aberto, atualiza o histórico ao vivo.
            if (document.getElementById("pn-jog")) admin.renderHistorico();
          } else {
            // Nao onboarded: atualiza so o "live" indicator, gate continua
            marcarLive(true);
          }
        },
        () => marcarLive(false)
      )
    );

    // Quem pode aprovar (nó `admins`): permite trocar organizador pelo console.
    desinscrever.push(
      onValue(ref(db, "papeis"), (snap) => {
        definirPapeis(snap.val() || {});
        conta.renderConta();
      })
    );

    // Fila de partidas enviadas pela galera, aguardando aprovação.
    desinscrever.push(
      onValue(ref(db, "submissoes"), (snap) => {
        setSubmissoes(snap.val() || {});
        if (document.getElementById("pn-aprov")) aprov.renderAprovacoes();
      })
    );

    // Temporadas (calendário do CS2) e propostas em votação.
    desinscrever.push(
      onValue(ref(db, "seasons"), (snap) => {
        setSeasons(snap.val());
        conta.renderApp();
      })
    );
    desinscrever.push(
      onValue(ref(db, "propostas"), (snap) => {
        setPropostas(snap.val() || {});
        if (document.getElementById("pn-assemb")) assembleia.renderAssembleia();
      })
    );

    // Resultados do GSI (kills/dano automáticos) chegando em tempo real.
    desinscrever.push(
      onValue(ref(db, "gsi/pending"), (snap) => {
        setPendentes(snap.val() || {});
        if (document.getElementById("pn-gsi")) admin.renderGsi();
        if (document.getElementById("pn-part")) admin.renderPartida();
      })
    );

    conta.renderApp();
  });
} else {
  mostrarSetup();
}
