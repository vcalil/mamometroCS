// Guia público "Como funciona" — aberto pelo botão no cabeçalho.
import { abrirOverlay } from "./overlay.js";

export function abrirAjuda() {
  document.getElementById("modal").innerHTML = `
    <button class="close-x" onclick="fecharConta()">×</button>
    <h2>Como funciona</h2>
    <div class="guia">
      <p>O <b>Mamômetro</b> é o ranking das <b>mamadas</b>. Antes de jogar CS2, a
      galera combina uma <b>meta</b> (ex.: <b>15 kills e 1500 de dano</b>). Quem
      <b>não bate</b> a meta “mama” quem bateu — e isso vira ponto no ranking. 😈</p>

      <h3>Entrar / criar sua conta</h3>
      <ol class="gsi-steps">
        <li>Clique em <b>Entrar</b> (aqui em cima) → aba <b>Cadastrar</b>.</li>
        <li>Cole o <b>seu perfil da Steam</b> (URL ou ID) e <b>escolha uma senha</b>.</li>
        <li>Escolha <b>qual card é você</b> (se já existia) ou <b>crie um novo</b>.</li>
        <li>Pronto! Você aparece no ranking com seu avatar. Nas próximas vezes, é
        só <b>Entrar</b> com o perfil + senha.</li>
      </ol>
      <p style="color:var(--muted);font-size:.88rem">Se o organizador já te
      adicionou, o cadastro cai direto no seu card — é só criar a senha.</p>

      <h3>Quem lança as partidas?</h3>
      <p>Os <b>organizadores</b> (Vini e Iago) registram as partidas e os números.
      Você só precisa entrar pra aparecer no ranking. 🎯</p>
    </div>
    <div class="row-btns"><button class="btn" onclick="abrirConta('cad')">Entrar / Cadastrar</button></div>`;
  abrirOverlay();
}
