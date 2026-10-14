'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { call, GameError, rpcBeacon, supabase } from './supabase';
import { getToken } from './identity';
import type { ChatMessage, TableState } from './types';

export type LiveEmote = { e: string; key: number };

const EMOTE_MS = 3500;

// Synchronisation d'une table : état initial, notifications temps réel
// (broadcast Supabase émis par la base à chaque changement) et relecture
// périodique de secours si le temps réel est indisponible. Gère aussi le chat,
// les emotes et la présence (signe de vie de l'onglet visible).
export function useTable(code: string) {
  const [state, setState] = useState<TableState | null>(null);
  const [loadError, setLoadError] = useState<GameError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [emotes, setEmotes] = useState<Record<string, LiveEmote>>({});
  const versionRef = useRef(-1);
  const inFlight = useRef(false);
  /** Décalage horloge serveur - horloge locale (ms). */
  const clockOffset = useRef(0);
  const lastMessageId = useRef(0);
  const seenMessages = useRef(new Set<number>());
  const seenEmotes = useRef<Record<string, number>>({});

  const showEmote = useCallback((p: string, e: string, at: number) => {
    if ((seenEmotes.current[p] ?? 0) >= at) return;
    seenEmotes.current[p] = at;
    setEmotes((cur) => ({ ...cur, [p]: { e, key: at } }));
    setTimeout(() => {
      setEmotes((cur) => {
        if (cur[p]?.key !== at) return cur;
        const next = { ...cur };
        delete next[p];
        return next;
      });
    }, EMOTE_MS);
  }, []);

  const addMessages = useCallback((incoming: ChatMessage[]) => {
    const fresh = incoming.filter((m) => !seenMessages.current.has(m.id));
    if (!fresh.length) return;
    for (const m of fresh) seenMessages.current.add(m.id);
    lastMessageId.current = Math.max(lastMessageId.current, ...fresh.map((m) => m.id));
    setMessages((cur) => [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-150));
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      addMessages(await call<ChatMessage[]>('get_messages', { p_code: code, p_token: getToken(), p_after: lastMessageId.current }));
    } catch {
      // Le chat se rattrapera à la prochaine lecture.
    }
  }, [code, addMessages]);

  const apply = useCallback(
    (next: TableState) => {
      // Ignore une réponse plus ancienne que l'état affiché.
      if (next.lobby.version < versionRef.current) return;
      versionRef.current = next.lobby.version;
      if (next.now) clockOffset.current = next.now - Date.now();
      setState(next);
      setLoadError(null);
      // Emotes récentes (filet de sécurité si le temps réel est coupé).
      for (const p of next.players) {
        if (p.emote && p.emote_at && next.now - p.emote_at < EMOTE_MS) showEmote(p.id, p.emote, p.emote_at);
      }
      if (next.lobby.chat_last && next.lobby.chat_last > lastMessageId.current) fetchMessages();
    },
    [showEmote, fetchMessages],
  );

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      apply(await call('get_state', { p_code: code, p_token: getToken() }));
    } catch (e) {
      const err = e instanceof GameError ? e : new GameError(String(e));
      if (err.hint === 'not_found') {
        setState(null);
        versionRef.current = -1;
      }
      setLoadError(err);
    } finally {
      inFlight.current = false;
    }
  }, [code, apply]);

  // Temps réel : la base publie { version } sur le canal lobby:<id>, ainsi que
  // les messages du chat et les emotes.
  const lobbyId = state?.lobby.id;
  useEffect(() => {
    if (!lobbyId) return;
    const client = supabase();
    const channel = client
      .channel(`lobby:${lobbyId}`, { config: { private: false } })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        const version = Number(payload?.version ?? Infinity);
        if (version > versionRef.current) refresh();
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (payload?.id) addMessages([payload as ChatMessage]);
      })
      .on('broadcast', { event: 'emote' }, ({ payload }) => {
        if (payload?.p && payload?.e) showEmote(String(payload.p), String(payload.e), Number(payload.at) || Date.now());
      })
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => {
      setLive(false);
      client.removeChannel(channel);
    };
  }, [lobbyId, refresh, addMessages, showEmote]);

  // Filet de sécurité : relecture régulière, plus fréquente si le temps réel est coupé.
  // Même abonné, un broadcast peut se perdre côté serveur (partition realtime.messages
  // absente) : on garde donc une relecture assez rapprochée.
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, live ? 4000 : 2000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [refresh, live]);

  // Présence : signe de vie toutes les 15 s tant que l'onglet est visible ; dès qu'il
  // passe en arrière-plan ou se ferme, le joueur est considéré absent (notifications).
  const isMember = !!state?.me;
  useEffect(() => {
    if (!isMember) return;
    const ping = (active: boolean) => {
      if (active) {
        call('ping', { p_code: code, p_token: getToken(), p_active: true }).catch(() => {});
      } else {
        rpcBeacon('ping', { p_code: code, p_token: getToken(), p_active: false });
      }
    };
    const beat = () => {
      if (document.visibilityState === 'visible') ping(true);
    };
    const onVisibility = () => ping(document.visibilityState === 'visible');
    const onHide = () => ping(false);
    beat();
    const timer = setInterval(beat, 15000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [code, isMember]);

  /** Exécute une action de jeu ; renvoie true si elle a réussi. */
  const act = useCallback(
    async (fn: string, args: Record<string, unknown> = {}) => {
      setBusy(true);
      setActionError(null);
      try {
        const result = await call<TableState | { left: true }>(fn, { p_code: code, p_token: getToken(), ...args });
        if (result && 'lobby' in result) apply(result);
        return true;
      } catch (e) {
        setActionError(e instanceof Error ? e.message : String(e));
        refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [code, apply, refresh],
  );

  /** Envoie un message ; renvoie un message d'erreur, ou null. */
  const sendMessage = useCallback(
    async (body: string) => {
      try {
        addMessages([await call<ChatMessage>('send_message', { p_code: code, p_token: getToken(), p_body: body })]);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    [code, addMessages],
  );

  const sendEmote = useCallback(
    async (emote: string) => {
      const me = state?.me;
      if (me) showEmote(me, emote, Date.now() + clockOffset.current);
      try {
        await call('send_emote', { p_code: code, p_token: getToken(), p_emote: emote });
      } catch {
        // Une emote perdue n'est pas grave.
      }
    },
    [code, state?.me, showEmote],
  );

  /** Demande au serveur d'appliquer la passe automatique (il vérifie le délai). */
  const claimTimeout = useCallback(async () => {
    try {
      apply(await call('claim_timeout', { p_code: code, p_token: getToken() }));
    } catch {
      refresh();
    }
  }, [code, apply, refresh]);

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  return {
    state,
    loadError,
    actionError,
    setActionError,
    busy,
    live,
    act,
    refresh,
    apply,
    messages,
    sendMessage,
    emotes,
    sendEmote,
    claimTimeout,
    serverNow,
  };
}
