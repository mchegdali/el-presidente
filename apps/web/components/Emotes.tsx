'use client';

import type { LiveEmote } from '@/lib/useTable';

// Même liste que côté serveur (send_emote).
export const EMOTES = ['👏', '😂', '😱', '🔥', '🌶️', '🤡', '😭', '💩', '🫡', '🎉', '😎', '🙏'];

export function EmoteBar({ onSend, children }: { onSend: (emote: string) => void; children?: React.ReactNode }) {
  return (
    <div className="emotes" role="toolbar" aria-label="Emotes rapides">
      {children}
      {EMOTES.map((e) => (
        <button key={e} type="button" className="emotes__btn" onClick={() => onSend(e)} aria-label={`Envoyer ${e}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

export function EmoteBubble({ emote }: { emote?: LiveEmote }) {
  if (!emote) return null;
  return (
    <span key={emote.key} className="emote-bubble" aria-live="polite">
      {emote.e}
    </span>
  );
}
