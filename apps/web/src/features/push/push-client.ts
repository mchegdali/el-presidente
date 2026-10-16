// Notifications push (Web Push) : le service worker /sw.js affiche les messages envoyés
// par l'API quand c'est au joueur de jouer et que sa page n'est pas au premier plan.
// L'abonnement est rattaché au compte (tous ses appareils, toutes ses tables).

import { api, read } from '@/lib/api';

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  );
}

export async function pushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON();
  const r = await read(
    api.push.subscriptions.$post({
      json: { endpoint: json.endpoint ?? '', keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
    }),
  );
  if (!r.ok) throw new Error(r.error.message);
}

/** Demande l'autorisation, abonne le navigateur et le rattache au compte. */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return pushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await read<{ publicKey: string | null }>(api.push['public-key'].$get());
    if (!key.ok || !key.value.publicKey)
      throw new Error('Les notifications ne sont pas encore configurées sur le serveur.');
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.value.publicKey),
    });
  }
  await saveSubscription(sub);
  return 'on';
}
