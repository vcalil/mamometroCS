import { ref, onValue } from "firebase/database";
import { db, configurado } from "./firebase.js";
import { aplicarSnapshot } from "./state.js";
import { toggleLinha } from "./ui/render.js";
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
  criarNovoJogador: conta.criarNovoJogador,
  sairConta: conta.sairConta,
});

// ---- Fecha o overlay ao clicar fora do modal ----
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") admin.fecharOverlay();
});

// ---- Bootstrap ----
if (configurado) {
  conta.iniciarAuth();
  onValue(
    ref(db, "estado"),
    (snap) => {
      aplicarSnapshot(snap.val() || {});
      marcarLive(true);
      conta.renderApp(); // decide entre muro de login e ranking, com os dados novos
      // Se o painel estiver aberto, atualiza o histórico ao vivo.
      if (document.getElementById("pn-jog")) admin.renderHistorico();
    },
    () => marcarLive(false)
  );
  onValue(ref(db, ".info/connected"), (s) => marcarLive(!!s.val()));

  // Resultados do GSI (kills/dano automáticos) chegando em tempo real.
  onValue(ref(db, "gsi/pending"), (snap) => {
    setPendentes(snap.val() || {});
    if (document.getElementById("pn-gsi")) admin.renderGsi();
    if (document.getElementById("pn-part")) admin.renderPartida();
  });
} else {
  mostrarSetup();
}
