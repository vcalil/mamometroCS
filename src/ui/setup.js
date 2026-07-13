// Tela mostrada quando o Firebase ainda não foi configurado (.env vazio).
export function mostrarSetup() {
  document.getElementById("conteudo").innerHTML = `
    <div class="setup">
      <h3>Falta configurar o Firebase</h3>
      <p style="color:var(--muted);font-size:.92rem">Pra todo mundo ver o mesmo ranking, o site usa o Firebase (grátis). Configure uma vez:</p>
      <ol>
        <li>Acesse <b>console.firebase.google.com</b> e crie um projeto (nome livre, pode pular o Google Analytics).</li>
        <li>No menu, entre em <b>Build → Realtime Database</b> e clique em <b>Criar banco de dados</b>. Escolha um local e o <b>modo de teste</b>.</li>
        <li>Volte em <b>Configurações do projeto</b> (engrenagem) → role até <b>Seus apps</b> → clique no ícone <code>&lt;/&gt;</code> (Web) e registre um app.</li>
        <li>Ele mostra um bloco <code>firebaseConfig</code>. Copie os valores para o arquivo <code>.env</code> (variáveis <code>VITE_FIREBASE_*</code>) — use o <code>.env.example</code> como modelo.</li>
        <li>Rode <code>npm run dev</code> de novo. Pronto: o placar fica ao vivo pra todos.</li>
      </ol>
      <div class="aviso">Dica: as variáveis ficam no <code>.env</code> na raiz do projeto. Nunca comite esse arquivo (já está no <code>.gitignore</code>).</div>
    </div>`;
  const live = document.getElementById("live");
  if (live) live.style.display = "none";
}
