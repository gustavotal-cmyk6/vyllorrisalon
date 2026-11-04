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
