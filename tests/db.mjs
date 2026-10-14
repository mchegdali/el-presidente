// Base Postgres en mémoire (PGlite) avec la migration appliquée, pour les tests
// et le backend de développement local.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

// Ce que Supabase fournit et que PGlite n'a pas : les rôles de l'API et realtime.send.
const SUPABASE_STUBS = `
  create role anon;
  create role authenticated;
  create schema realtime;
  create table realtime.sent (id serial primary key, payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
  returns void language sql as $$
    insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private)
  $$;
`;

export const RPC_ARGS = {
  get_state: ['p_code', 'p_token'],
  create_lobby: ['p_token', 'p_name'],
  join_lobby: ['p_code', 'p_token', 'p_name'],
  start_round: ['p_code', 'p_token'],
  give_cards: ['p_code', 'p_token', 'p_cards'],
  play_cards: ['p_code', 'p_token', 'p_cards'],
  pass_turn: ['p_code', 'p_token'],
  leave_lobby: ['p_code', 'p_token'],
  kick_player: ['p_code', 'p_token', 'p_player'],
  cancel_round: ['p_code', 'p_token'],
  claim_timeout: ['p_code', 'p_token'],
  set_turn_limit: ['p_code', 'p_token', 'p_seconds'],
  ping: ['p_code', 'p_token', 'p_active'],
  save_push: ['p_code', 'p_token', 'p_endpoint', 'p_p256dh', 'p_auth'],
  push_public_key: [],
  get_messages: ['p_code', 'p_token', 'p_after'],
  send_message: ['p_code', 'p_token', 'p_body'],
  send_emote: ['p_code', 'p_token', 'p_emote'],
};

const ARG_CASTS = { p_cards: '::text[]', p_player: '::uuid', p_seconds: '::integer', p_active: '::boolean', p_after: '::bigint' };

export async function createDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql') && !f.includes('supabase_only')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  return db;
}

// Appelle une fonction RPC comme le ferait PostgREST (arguments nommés).
export async function rpc(db, fn, args) {
  const names = RPC_ARGS[fn];
  if (!names) throw new Error(`RPC inconnue : ${fn}`);
  const params = names.map((n) => (n in args ? args[n] : null));
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}${ARG_CASTS[n] ?? ''}`).join(', ')}) as r`;
  const res = await db.query(sql, params);
  return res.rows[0].r;
}
