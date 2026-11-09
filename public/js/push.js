// Ativar/desativar as notificações do app neste aparelho (Web Push).
import { GET, POST } from './core.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;

function keyBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function pushState() {
  if (!supported())
    return { supported: false, reason: isIOS() && !standalone()
      ? 'No iPhone, primeiro adicione o app à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.'
      : 'Este navegador não permite notificações. Use o Chrome, Edge, Firefox ou Safari atualizados.' };
  if (Notification.permission === 'denied') return { supported: true, denied: true };
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && (await reg.pushManager.getSubscription());
  return { supported: true, on: !!sub && Notification.permission === 'granted' };
}

export async function enablePush() {
  const { key } = await GET('/api/push/key');
  if (!key) throw new Error('As notificações ainda não foram configuradas no servidor.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return pushState();
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await POST('/api/push/subscribe', sub.toJSON());
  return pushState();
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await POST('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe();
  }
  return pushState();
}

// ---------- Aviso visível + passo a passo para quem não sabe ativar ----------
import { ic, modal, toast, fail, submitting } from './core.js';

const isAndroid = () => /android/i.test(navigator.userAgent);
const isSamsung = () => /samsungbrowser/i.test(navigator.userAgent);
const isSafariMac = () => /macintosh/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/chrome|crios|edg/i.test(navigator.userAgent);
const steps = (list) => `<ol class="guide">${list.map((t, i) => `<li><span>${i + 1}</span><div>${t}</div></li>`).join('')}</ol>`;

/** Passo a passo de acordo com o aparelho e a situação (iPhone fora da tela de início, bloqueado, sem suporte). */
export function pushGuideHtml(s) {
  if (isIOS() && !standalone())
    return `<p class="small muted" style="margin-bottom:12px">No iPhone, a Apple só permite notificações quando o app está na Tela de Início. Leva menos de 1 minuto:</p>
      ${steps([
        `Abra este site no <b>Safari</b> (o navegador da bússola).`,
        `Toque no botão <b>Compartilhar</b> ${ic('share', 16)} na barra de baixo.`,
        `Role e toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.`,
        `Feche o Safari e abra o <b>app Vyllorri</b> pelo ícone novo na tela do celular.`,
        `Entre na sua conta e toque em <b>Ativar notificações</b> no Início. Quando o iPhone perguntar, toque em <b>Permitir</b>.`,
      ])}<p class="tiny muted" style="margin-top:10px">Precisa do iOS 16.4 ou mais novo (Ajustes → Geral → Sobre).</p>`;
  if (s.denied) {
    if (isIOS()) return steps([`Abra os <b>Ajustes</b> do iPhone.`, `Toque em <b>Notificações</b> e procure <b>Vyllorri</b> na lista.`, `Ligue <b>Permitir Notificações</b>.`, `Volte ao app e toque em <b>Ativar notificações</b> de novo.`]);
    if (isSamsung()) return steps([`Toque no menu ${ic('menu', 16)} do navegador → <b>Configurações</b>.`, `Toque em <b>Sites e downloads</b> → <b>Notificações</b>.`, `Encontre este site e ligue as notificações.`, `Volte aqui e toque em <b>Ativar notificações</b>.`]);
    if (isAndroid()) return steps([`Toque no ícone ${ic('lock', 16)} (ou ${ic('settings', 16)}) ao lado do endereço do site, lá em cima.`, `Toque em <b>Permissões</b> (ou <b>Configurações do site</b>).`, `Em <b>Notificações</b>, escolha <b>Permitir</b>.`, `Recarregue a página e toque em <b>Ativar notificações</b>.`]);
    if (isSafariMac()) return steps([`No menu <b>Safari</b>, abra <b>Ajustes</b> → aba <b>Sites</b>.`, `Na lateral, clique em <b>Notificações</b>.`, `Encontre este site e troque para <b>Permitir</b>.`, `Recarregue a página e clique em <b>Ativar notificações</b>.`]);
    return steps([`Clique no ícone ${ic('lock', 16)} à esquerda do endereço do site, lá em cima.`, `Em <b>Notificações</b>, escolha <b>Permitir</b> (às vezes fica em <b>Configurações do site</b>).`, `Recarregue a página (tecla F5).`, `Clique em <b>Ativar notificações</b> de novo.`]);
  }
  if (!s.supported) return `<p class="small">${s.reason}</p>`;
  return steps([`Toque em <b>Ativar notificações</b>.`, `O navegador vai perguntar se pode mostrar notificações: toque em <b>Permitir</b>.`, `Pronto! Use <b>Enviar teste</b> para ver como chega.`]);
}

/** Abre o passo a passo numa janela. */
export function pushGuide(s, after) {
  const close = modal({
    title: 'Como ativar as notificações',
    body: `${pushGuideHtml(s)}<div class="actions stretch" style="margin-top:16px"><button class="btn primary" data-ok>Entendi</button></div>`,
    onMount(el) { el.querySelector('[data-ok]').onclick = () => (close(), after?.()); },
  });
}

/** Tenta ativar; se o aparelho não deixar, mostra como fazer. Devolve o novo estado. */
export async function askPush() {
  const s = await pushState();
  if (!s.supported || s.denied) return pushGuide(s), s;
  const n = await enablePush();
  if (n.on) toast('Notificações ativadas neste aparelho');
  else pushGuide(n);
  return n;
}

const DISMISS = 'vb-push-later';
/** Aviso no Início enquanto as notificações não estiverem ativas neste aparelho ("Agora não" esconde por 7 dias). */
export async function pushBanner(box) {
  if (!box) return;
  let s;
  try {
    s = await pushState();
    if (s.on || Number(localStorage.getItem(DISMISS) || 0) > Date.now()) return;
  } catch { return; }
  box.innerHTML = `<div class="push-banner"><span class="pb-ic">${ic('bell', 22)}</span>
    <div class="grow"><b>Ative as notificações</b><small>Saiba na hora quando uma cliente agendar, mandar comprovante ou cancelar.</small></div>
    <div class="pb-act"><button class="btn sm primary" data-on>${s.supported && !s.denied ? 'Ativar' : 'Como ativar'}</button>
      <button class="btn sm ghost" data-how>${s.supported && !s.denied ? 'Como funciona?' : 'Agora não'}</button></div></div>`;
  box.querySelector('[data-on]').onclick = async (e) => {
    await submitting(e.currentTarget, async () => {
      const n = await askPush();
      if (n?.on) box.innerHTML = '';
    }).catch(() => {});
  };
  box.querySelector('[data-how]').onclick = () => {
    if (s.supported && !s.denied) return pushGuide(s);
    try { localStorage.setItem(DISMISS, String(Date.now() + 7 * 864e5)); } catch {}
    box.innerHTML = '';
  };
}
