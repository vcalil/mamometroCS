import { ref, onValue } from "firebase/database";
import { db, configurado } from "./firebase.js";
import { aplicarSnapshot, resetarCarga } from "./state.js";
import { aoMudarAuth } from "./auth.js";
import { toggleLinha, trocarVisao } from "./ui/render.js";
import { mostrarSetup } from "./ui/setup.js";
import * as admin from "./ui/admin.js";
import * as conta from "./ui/conta.js";
import { abrirAjuda } from "./ui/ajuda.js";
import { setPendentes } from "./gsi-client.js";

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
  abrirAjuda,
  abrirAdmin: admin.abrirAdmin,
  fecharOverlay: admin.fecharOverlay,
  trocarTab: admin.trocarTab,
  addJogador: admin.addJogador,
  removerJogador: admin.removerJogador,
  buscarSteam: admin.buscarSteam,
  confirmarSteam: admin.confirmarSteam,
  limparSteam: admin.limparSteam,
  addAoTime: admin.addAoTime,
  removerDoTime: admin.removerDoTime,
  setStat: admin.setStat,
  salvarMeta: admin.salvarMeta,
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
  descartarGsi: admin.descartarGsi,
  // conta (login/cadastro dos jogadores)
  abrirConta: conta.abrirConta,
  fecharConta: conta.fecharConta,
  trocarTabConta: conta.trocarTabConta,
  fazerCadastro: conta.fazerCadastro,
  fazerEntrar: conta.fazerEntrar,
  reivindicar: conta.reivindicar,
  vincularCard: conta.vincularCard,
  criarNovoJogador: conta.criarNovoJogador,
  sairConta: conta.sairConta,
});

// ---- Fecha o overlay ao clicar fora do modal ----
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") admin.fecharOverlay();
});

// ---- Bootstrap ----
// As regras do banco exigem login pra ler `estado` e `gsi/pending`. Se a gente
// assinasse esses nós no carregamento da página (antes do login), o Firebase
// negaria a leitura e CANCELARIA o listener — que não se reinscreve sozinho
// quando a sessão chega. Por isso as assinaturas são amarradas ao login.
if (configurado) {
  onValue(ref(db, ".info/connected"), (s) => marcarLive(!!s.val()));

  let desinscrever = [];
  aoMudarAuth((user) => {
    desinscrever.forEach((fn) => fn());
    desinscrever = [];

    if (!user) {
      // Deslogado: descarta os dados em memória pra não vazar pro próximo.
      aplicarSnapshot({});
      resetarCarga();
      conta.resetarOfertaVinculo();
      conta.renderApp();
      return;
    }

    desinscrever.push(
      onValue(
        ref(db, "estado"),
        (snap) => {
          aplicarSnapshot(snap.val() || {});
          marcarLive(true);
          conta.renderApp(); // muro de login x ranking, já com os dados novos
          // Logado sem card do histórico? Oferece o vínculo (uma vez).
          conta.garantirVinculo();
          // Se o painel estiver aberto, atualiza o histórico ao vivo.
          if (document.getElementById("pn-jog")) admin.renderHistorico();
        },
        () => marcarLive(false)
      )
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
