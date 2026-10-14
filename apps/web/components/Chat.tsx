'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, TableState } from '@/lib/types';
import type { TableApi } from './TableRoom';

const EMOJIS = ['😀', '😂', '🤣', '😍', '😎', '🤔', '😏', '😱', '😭', '😡', '🤡', '🥳', '👍', '👎', '👏', '🙏', '🔥', '🌶️', '🎉', '💩', '🍺', '🌮', '🌵', '👑'];
const MAX_LENGTH = 300;

type Segment = { text: string; mention?: string };

/** Découpe un message en texte et @mentions (noms des joueurs de la table, même avec espaces). */
export function splitMentions(body: string, names: string[]): Segment[] {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const lower = body.toLowerCase();
  const out: Segment[] = [];
  let buf = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '@') {
      const name = sorted.find((n) => lower.startsWith(`@${n.toLowerCase()}`, i));
      if (name) {
        if (buf) out.push({ text: buf });
        buf = '';
        out.push({ text: body.slice(i, i + 1 + name.length), mention: name });
        i += 1 + name.length;
        continue;
      }
    }
    buf += body[i];
    i++;
  }
  if (buf) out.push({ text: buf });
  return out;
}

export function mentions(body: string, name: string | undefined) {
  return !!name && body.toLowerCase().includes(`@${name.toLowerCase()}`);
}

function time(at: number) {
  return new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Messages non lus et mentions, pour le bouton du chat. */
export function useUnread(messages: ChatMessage[], me: string | null, myName: string | undefined, open: boolean) {
  const [readUpTo, setReadUpTo] = useState(() => messages.at(-1)?.id ?? 0);
  const lastId = messages.at(-1)?.id ?? 0;
  useEffect(() => {
    if (open) setReadUpTo(lastId);
  }, [open, lastId]);
  const unread = messages.filter((m) => m.id > readUpTo && m.p !== me);
  return { count: unread.length, mentioned: unread.some((m) => mentions(m.body, myName)) };
}

export default function Chat({
  state,
  table,
  onClose,
  className = '',
}: {
  state: TableState;
  table: TableApi;
  onClose?: () => void;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [palette, setPalette] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const me = state.me;
  const myName = state.players.find((p) => p.id === me)?.name;
  const names = useMemo(() => state.players.map((p) => p.name), [state.players]);
  const { messages } = table;

  // Défile vers le dernier message.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Autocomplétion des @mentions : le mot en cours de frappe commence par @.
  const before = text.slice(0, caret);
  const fragment = before.match(/@([^@\n]{0,20})$/)?.[1];
  const suggestions =
    fragment === undefined
      ? []
      : state.players
          .filter((p) => p.id !== me && p.name.toLowerCase().startsWith(fragment.toLowerCase()))
          .filter((p) => p.name.toLowerCase() !== fragment.toLowerCase())
          .slice(0, 5);

  const insertAt = (start: number, end: number, value: string) => {
    const next = (text.slice(0, start) + value + text.slice(end)).slice(0, MAX_LENGTH);
    const pos = Math.min(start + value.length, next.length);
    setText(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const pickMention = (name: string) => insertAt(caret - (fragment?.length ?? 0) - 1, caret, `@${name} `);
  const pickEmoji = (emoji: string) => insertAt(caret, caret, emoji);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const err = await table.sendMessage(body);
    setSending(false);
    if (err) {
      setError(err);
    } else {
      setText('');
      setCaret(0);
      setPalette(false);
    }
  };

  const track = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  return (
    <section className={`chat panel ${className}`} aria-label="Chat de la table">
      <header className="chat__head">
        <h2 className="title-rye">La plática</h2>
        {onClose && (
          <button type="button" className="chat__close" onClick={onClose} aria-label="Fermer le chat">
            ✕
          </button>
        )}
      </header>
      <div className="chat__list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <p className="muted chat__empty">Aucun message. Lancez la conversation ! 🌮</p>}
        {messages.map((m) => {
          const mine = m.p === me;
          const forMe = !mine && mentions(m.body, myName);
          return (
            <div key={m.id} className={`chat__msg ${mine ? 'chat__msg--mine' : ''} ${forMe ? 'chat__msg--ping' : ''}`}>
              <div className="chat__meta">
                <strong>{mine ? 'Vous' : m.name}</strong> <span className="muted">{time(m.at)}</span>
              </div>
              <div className="chat__body">
                {splitMentions(m.body, names).map((s, i) =>
                  s.mention ? (
                    <span key={i} className={`mention ${s.mention === myName ? 'mention--me' : ''}`}>
                      {s.text}
                    </span>
                  ) : (
                    <span key={i}>{s.text}</span>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
      {suggestions.length > 0 && (
        <div className="chat__suggest" role="listbox" aria-label="Mentionner un joueur">
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickMention(p.name)}
            >
              @{p.name}
            </button>
          ))}
        </div>
      )}
      {palette && (
        <div className="chat__emojis">
          {EMOJIS.map((em) => (
            <button key={em} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickEmoji(em)}>
              {em}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="error chat__error" role="alert">
          {error}
        </p>
      )}
      <form className="chat__form" onSubmit={submit}>
        <button
          type="button"
          className={`chat__emoji-toggle ${palette ? 'chat__emoji-toggle--on' : ''}`}
          onClick={() => setPalette((v) => !v)}
          aria-label="Émoticônes"
          aria-expanded={palette}
        >
          😀
        </button>
        <input
          ref={inputRef}
          className="input chat__input"
          value={text}
          maxLength={MAX_LENGTH}
          placeholder="Message… (@ pour mentionner)"
          enterKeyHint="send"
          onChange={(e) => {
            setText(e.target.value);
            track(e.target);
          }}
          onSelect={(e) => track(e.currentTarget)}
          onKeyDown={(e) => {
            if ((e.key === 'Tab' || e.key === 'Enter') && suggestions.length) {
              e.preventDefault();
              pickMention(suggestions[0].name);
            }
          }}
        />
        <button type="submit" className="btn btn--gold btn--small" disabled={sending || !text.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
