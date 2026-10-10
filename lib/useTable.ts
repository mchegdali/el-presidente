'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { call, GameError, supabase } from './supabase';
import { getToken } from './identity';
import type { TableState } from './types';

// Synchronisation d'une table : état initial, notifications temps réel
// (broadcast Supabase émis par la base à chaque changement) et relecture
// périodique de secours si le temps réel est indisponible.
export function useTable(code: string) {
  const [state, setState] = useState<TableState | null>(null);
  const [loadError, setLoadError] = useState<GameError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const versionRef = useRef(-1);
  const inFlight = useRef(false);

  const apply = useCallback((next: TableState) => {
    // Ignore une réponse plus ancienne que l'état affiché.
    if (next.lobby.version < versionRef.current) return;
    versionRef.current = next.lobby.version;
    setState(next);
    setLoadError(null);
  }, []);

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

  // Temps réel : la base publie { version } sur le canal lobby:<id>.
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
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') refresh();
      });
    return () => {
      setLive(false);
      client.removeChannel(channel);
    };
  }, [lobbyId, refresh]);

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

  return { state, loadError, actionError, setActionError, busy, live, act, refresh, apply };
}
