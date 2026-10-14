'use client';

import { call } from './supabase';
import { getToken } from './identity';

// Notifications push (Web Push) : le service worker /sw.js reçoit les messages
// envoyés par l'Edge Function `push` quand c'est au joueur de jouer et que sa page
// n'est pas au premier plan.

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
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

async function saveSubscription(code: string, sub: PushSubscription) {
  const json = sub.toJSON();
  await call('save_push', {
    p_code: code,
    p_token: getToken(),
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
  });
}

/** Demande l'autorisation, abonne le navigateur et l'associe au joueur de cette table. */
export async function enablePush(code: string): Promise<PushStatus> {
  if (!pushSupported()) return pushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await call<string | null>('push_public_key', {});
    if (!key) throw new Error('Les notifications ne sont pas encore configurées sur le serveur.');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  }
  await saveSubscription(code, sub);
  return 'on';
}

/** À l'arrivée sur une table : si le navigateur est déjà abonné, on l'associe à ce joueur. */
export async function syncPush(code: string) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await saveSubscription(code, sub);
}
