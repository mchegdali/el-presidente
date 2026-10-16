'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Input } from '@/components/Field/Field';
import { Panel } from '@/components/Panel/Panel';
import { useTableContext } from '../table/context';
import styles from './Chat.module.css';
import { mentions, splitMentions } from './mentions';
import { useChat } from './use-chat';

const EMOJIS = [
  '😀',
  '😂',
  '🤣',
  '😍',
  '😎',
  '🤔',
  '😏',
  '😱',
  '😭',
  '😡',
  '🤡',
  '🥳',
  '👍',
  '👎',
  '👏',
  '🙏',
  '🔥',
  '🌶️',
  '🎉',
  '💩',
  '🍺',
  '🌮',
  '🌵',
  '👑',
];
const MAX_LENGTH = 300;

const time = (at: number) => new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function Chat({ onClose, drawer = false }: { onClose?: () => void; drawer?: boolean }) {
  const { table, me, conn } = useTableContext();
  const messages = useChat();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [palette, setPalette] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const myId = table.players[me]?.id;
  const myName = table.players[me]?.name;
  const names = table.players.map((p) => p.name);

  // Envoi par la socket, avec accusé de réception (React 19 : action de formulaire).
  const [error, send, sending] = useActionState(async (_prev: string | null) => {
    const body = text.trim();
    if (!body) return null;
    const r = await conn.request({ op: 'chat', req: 0, body });
    if (!r.ok) return r.message;
    setText('');
    setCaret(0);
    setPalette(false);
    return null;
  }, null);

  // Défile vers le dernier message à chaque nouveau message.
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const el = listRef.current;
    if (el && lastId !== undefined) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  // Autocomplétion des @mentions : le mot en cours de frappe commence par @.
  const fragment = text.slice(0, caret).match(/@([^@\n]{0,20})$/)?.[1];
  const suggestions =
    fragment === undefined
      ? []
      : table.players
          .filter((p) => p.seat !== me && p.name.toLowerCase().startsWith(fragment.toLowerCase()))
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
  const track = (el: HTMLInputElement) => setCaret(el.selectionStart ?? el.value.length);

  return (
    <Panel className={drawer ? `${styles.chat} ${styles.drawer}` : styles.chat} aria-label="Chat de la table">
      <header className={styles.head}>
        <h2 className="title-rye">La plática</h2>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer le chat">
            ✕
          </button>
        )}
      </header>
      <div className={styles.list} ref={listRef} aria-live="polite">
        {messages.length === 0 && <p className={`muted ${styles.empty}`}>Aucun message. Lancez la conversation ! 🌮</p>}
        {messages.map((m) => {
          const mine = m.p === myId;
          const forMe = !mine && mentions(m.body, myName);
          return (
            <div
              key={m.id}
              className={[styles.msg, mine && styles.mine, forMe && styles.ping].filter(Boolean).join(' ')}
            >
              <div className={styles.meta}>
                <strong>{mine ? 'Vous' : m.name}</strong> <span className="muted">{time(m.at)}</span>
              </div>
              <div className={styles.body}>
                {splitMentions(m.body, names).map((s, i) =>
                  s.mention ? (
                    <span
                      key={i}
                      className={s.mention === myName ? `${styles.mention} ${styles.mentionMe}` : styles.mention}
                    >
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
        <div className={styles.chips} role="listbox" aria-label="Mentionner un joueur">
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
        <div className={`${styles.chips} ${styles.emojis}`}>
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertAt(caret, caret, em)}
            >
              {em}
            </button>
          ))}
        </div>
      )}
      {error && <Alert className={styles.error}>{error}</Alert>}
      <form className={styles.form} action={send}>
        <button
          type="button"
          className={palette ? `${styles.emojiToggle} ${styles.emojiOn}` : styles.emojiToggle}
          onClick={() => setPalette((v) => !v)}
          aria-label="Émoticônes"
          aria-expanded={palette}
        >
          😀
        </button>
        <Input
          ref={inputRef}
          className={styles.input}
          value={text}
          maxLength={MAX_LENGTH}
          placeholder="Message… (@ pour mentionner)"
          enterKeyHint="send"
          aria-label="Message"
          onChange={(e) => {
            setText(e.target.value);
            track(e.target);
          }}
          onSelect={(e) => track(e.currentTarget)}
          onKeyDown={(e) => {
            if ((e.key === 'Tab' || e.key === 'Enter') && suggestions.length > 0) {
              e.preventDefault();
              pickMention(suggestions[0]!.name);
            }
          }}
        />
        <Button type="submit" variant="gold" size="small" disabled={sending || !text.trim()}>
          Envoyer
        </Button>
      </form>
    </Panel>
  );
}
