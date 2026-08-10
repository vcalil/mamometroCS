// Helpers de UI compartilhados: abrir/fechar o overlay (modal) e a tag de avatar.
// Antes estavam copiados em conta/ajuda/assembleia/enviar/admin/render — agora
// vivem num lugar só. Os módulos que expõem um `fechar*` pro onclick (via a
// tabela window do main.js) só delegam pra fecharOverlay aqui.

import { escapar } from "../state.js";

export function abrirOverlay() {
  document.getElementById("overlay").classList.add("on");
}

export function fecharOverlay() {
  document.getElementById("overlay").classList.remove("on");
}

// Tag <img> do avatar (ou string vazia se o jogador não tem perfil Steam).
export function avImg(url, cls = "av") {
  return url ? `<img class="${cls}" src="${escapar(url)}" alt="" loading="lazy">` : "";
}
