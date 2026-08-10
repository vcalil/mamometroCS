// Guia visual de onboarding: passo a passo pra pegar os 2 códigos do CS2
// (Código de Autenticação + código da última partida) + um diagrama SVG que
// mostra onde eles aparecem na página da Steam.
//
// FONTE ÚNICA: o gate do SPA (src/ui/onboard.js) importa daqui. A página
// standalone public/onboard.html NÃO é bundlada pelo Vite (é servida as-is),
// então lá a mesma marcação está INLINE — se mudar aqui, atualize lá também
// (procure por "GUIA-ONBOARD" no onboard.html).

// Página oficial da Steam que mostra OS DOIS códigos de uma vez (logado).
export const STEAM_CODES_URL =
  "https://help.steampowered.com/pt/wizard/HelpWithGameIssue/?appid=730&issueid=128";

// Diagrama da página da Steam com os dois códigos numerados (① e ②), casando
// com os badges nos campos do formulário. Usa as CSS vars do tema (funciona
// tanto no SPA quanto no onboard.html, que definem as mesmas variáveis).
export function diagramaCodigosSvg() {
  return `
    <svg viewBox="0 0 640 300" role="img" aria-label="A página da Steam mostra o código de autenticação (1) e o código da partida mais recente (2)" style="width:100%;height:auto;display:block;">
      <rect x="16" y="14" width="608" height="272" rx="14" fill="var(--panel2)" stroke="var(--line)" stroke-width="1.5"/>
      <path d="M16 28a14 14 0 0 1 14-14h580a14 14 0 0 1 14 14v26H16z" fill="var(--panel)"/>
      <circle cx="40" cy="34" r="5" fill="var(--coral)"/>
      <circle cx="58" cy="34" r="5" fill="var(--gold)"/>
      <circle cx="76" cy="34" r="5" fill="var(--mint)"/>
      <text x="98" y="39" fill="var(--muted)" font-family="Inter,system-ui,sans-serif" font-size="13">Steam · Códigos de partilha de partidas — Counter-Strike 2</text>

      <text x="40" y="98" fill="var(--muted)" font-family="Inter,system-ui,sans-serif" font-size="13">Teu código de autenticação</text>
      <rect x="40" y="108" width="372" height="42" rx="9" fill="var(--bg)" stroke="var(--line)"/>
      <text x="58" y="135" fill="var(--ink)" font-family="'Space Mono',monospace" font-size="18" letter-spacing="1">AAAA-1111-BBBB</text>
      <circle cx="446" cy="129" r="17" fill="var(--gold)"/>
      <text x="446" y="135" text-anchor="middle" fill="#2a1400" font-family="Inter,sans-serif" font-weight="700" font-size="17">1</text>

      <text x="40" y="196" fill="var(--muted)" font-family="Inter,system-ui,sans-serif" font-size="13">Código da tua partida mais recente</text>
      <rect x="40" y="206" width="476" height="42" rx="9" fill="var(--bg)" stroke="var(--line)"/>
      <text x="58" y="233" fill="var(--ink)" font-family="'Space Mono',monospace" font-size="16" letter-spacing="0.5">CSGO-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX</text>
      <circle cx="550" cy="227" r="17" fill="var(--mint)"/>
      <text x="550" y="233" text-anchor="middle" fill="#04231a" font-family="Inter,sans-serif" font-weight="700" font-size="17">2</text>
    </svg>`;
}

// Bloco completo do guia (heading + botão pra abrir a página + passos + SVG).
// `variante` só ajusta um detalhe de cópia ("já logado no site" vs "novo").
export function guiaOnboardHtml() {
  return `
    <div class="ob-guia" style="background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:16px 16px 18px;margin:0 0 20px;">
      <div style="font-family:Anton,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:1px;font-size:1.05rem;margin-bottom:4px;">Como pegar teus 2 códigos <span style="color:var(--muted);font-family:Inter,sans-serif;text-transform:none;letter-spacing:0;font-size:.85rem;">(± 1 min)</span></div>
      <p style="color:var(--muted);font-size:.9rem;margin:0 0 14px;">Os dois saem da <b>mesma</b> página da Steam. Faz login na Steam no navegador e abre:</p>

      <a href="${STEAM_CODES_URL}" target="_blank" rel="noopener"
         style="display:inline-flex;align-items:center;gap:8px;background:var(--coral);color:#2a0713;border-radius:10px;padding:11px 15px;font-family:Inter;font-weight:700;font-size:.9rem;text-decoration:none;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px;">
        Abrir a página de códigos do CS2 ↗
      </a>

      ${diagramaCodigosSvg()}

      <ol style="margin:16px 0 0;padding-left:20px;color:var(--ink);font-size:.92rem;line-height:1.6;">
        <li>Na página da Steam, se ela pedir, clica em <b>“Criar”</b>/<b>“Gerar”</b> pra liberar o código.</li>
        <li><span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:var(--gold);color:#2a1400;font-weight:700;font-size:.72rem;align-items:center;justify-content:center;vertical-align:middle;">1</span> Copia o <b>Código de Autenticação</b> (formato <code style="font-family:'Space Mono',monospace;">AAAA-1111-BBBB</code>) e cola no 1º campo.</li>
        <li><span style="display:inline-flex;width:18px;height:18px;border-radius:50%;background:var(--mint);color:#04231a;font-weight:700;font-size:.72rem;align-items:center;justify-content:center;vertical-align:middle;">2</span> Copia o <b>código da partida mais recente</b> (começa com <code style="font-family:'Space Mono',monospace;">CSGO-</code>) e cola no 2º campo.</li>
        <li>Clica em <b>Entrar no Mamômetro</b>. Pronto — o bot passa a puxar tuas próximas partidas sozinho.</li>
      </ol>

      <p style="color:var(--muted);font-size:.76rem;margin:14px 0 0;">Copia e cola exatamente como a Steam mostra (não muda maiúsculas/minúsculas). Se der erro, gera um código novo na página e tenta de novo.</p>
    </div>`;
}
