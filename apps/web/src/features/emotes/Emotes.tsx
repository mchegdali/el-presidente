'use client';

import { EMOTES } from '@el-presidente/game/protocol';
import type { ReactNode } from 'react';
import styles from './Emotes.module.css';

const VISIBLE_MS = 3500;

export function EmoteBar({ onSend, children }: { onSend: (emote: number) => void; children?: ReactNode }) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="Emotes rapides">
      {children}
      {EMOTES.map((e, i) => (
        <button key={e} type="button" className={styles.btn} onClick={() => onSend(i)} aria-label={`Envoyer ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

/** Bulle d'emote au-dessus d'un joueur, quelques secondes après son envoi. */
export function EmoteBubble({ emote, at, now }: { emote: number | null; at: number | null; now: number }) {
  if (emote === null || at === null || now - at > VISIBLE_MS) return null;
  return (
    <span key={at} className={styles.bubble} aria-live="polite">
      {EMOTES[emote]}
    </span>
  );
}
