import { afterAll, expect, test } from 'bun:test';
import { schema } from '@el-presidente/db';
import { createTestDatabase } from '@el-presidente/db/testing';
import { MESSAGE_RETENTION_MS, purgeExpired, TABLE_RETENTION_MS } from './purge';

const t = createTestDatabase();
afterAll(() => t.close());

test('purge : messages de plus d’un an (et leurs signalements), sessions et vérifications expirées', () => {
  const now = Date.UTC(2027, 0, 1);
  const old = new Date(now - MESSAGE_RETENTION_MS - 1);
  const recent = new Date(now - MESSAGE_RETENTION_MS + 60_000);
  const { db } = t;

  db.insert(schema.user).values({ id: 'u', name: 'Ana', email: 'ana@example.org' }).run();
  db.insert(schema.lobbies).values({ id: 'l', code: 'ABCD' }).run();
  const [a, b] = db
    .insert(schema.messages)
    .values([
      { lobbyId: 'l', userId: 'u', name: 'Ana', body: 'ancien', ip: '192.0.2.1', createdAt: old },
      { lobbyId: 'l', userId: 'u', name: 'Ana', body: 'récent', ip: '192.0.2.1', createdAt: recent },
    ])
    .returning({ id: schema.messages.id })
    .all();
  db.insert(schema.messageReports).values({ messageId: a!.id, reporterId: 'u' }).run();
  db.insert(schema.session)
    .values([
      { id: 's1', token: 't1', userId: 'u', expiresAt: new Date(now - 1) },
      { id: 's2', token: 't2', userId: 'u', expiresAt: new Date(now + 60_000) },
    ])
    .run();
  db.insert(schema.verification)
    .values({ id: 'v', identifier: 'x', value: 'y', expiresAt: new Date(now - 1) })
    .run();

  expect(purgeExpired(db, now)).toEqual({ messages: 1, sessions: 1, verifications: 1, tables: 0, guests: 0 });
  expect(db.select({ id: schema.messages.id }).from(schema.messages).all()).toEqual([{ id: b!.id }]);
  expect(db.select().from(schema.messageReports).all()).toEqual([]);
  expect(db.select({ id: schema.session.id }).from(schema.session).all()).toEqual([{ id: 's2' }]);
  expect(purgeExpired(db, now)).toEqual({ messages: 0, sessions: 0, verifications: 0, tables: 0, guests: 0 });
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

test('purge : tables sans activité depuis 30 jours vidées, ligne gardée tant qu’un message y tient', () => {
  const now = Date.UTC(2028, 0, 1);
  const old = new Date(now - TABLE_RETENTION_MS - 1);
  const recent = new Date(now - 60_000);
  const { db } = t;
  const { lobbies, players, games, messages } = schema;

  db.insert(schema.user).values({ id: 'v', name: 'Beto', email: 'beto@example.org' }).run();
  db.insert(lobbies)
    .values([
      { id: 'mute', code: 'MUTE', updatedAt: old }, // abandonnée, sans message : supprimée
      { id: 'chat', code: 'CHAT', updatedAt: old }, // abandonnée, avec un vieux message : vidée
      { id: 'game', code: 'GAME', updatedAt: old }, // manche jouée récemment : gardée
      { id: 'talk', code: 'TALK', updatedAt: old }, // message récent : gardée
      { id: 'live', code: 'LIVE', updatedAt: old }, // chargée en mémoire : gardée
    ])
    .run();
  db.insert(players)
    .values(
      ['mute', 'chat', 'game', 'talk', 'live'].map((lobbyId) => ({ lobbyId, userId: 'v', seat: 0, name: 'Beto' })),
    )
    .run();
  const state = { v: 1 } as never;
  db.insert(games)
    .values([
      { lobbyId: 'mute', roundNo: 1, version: 1, state, updatedAt: old },
      { lobbyId: 'game', roundNo: 1, version: 1, state, updatedAt: recent },
    ])
    .run();
  db.insert(messages)
    .values([
      { lobbyId: 'chat', userId: 'v', name: 'Beto', body: 'vieux', createdAt: old },
      { lobbyId: 'talk', userId: 'v', name: 'Beto', body: 'récent', createdAt: recent },
    ])
    .run();

  expect(purgeExpired(db, now, { tables: new Set(['live']) }).tables).toBe(2);
  expect(ids(db.select({ id: lobbies.id }).from(lobbies).all())).toEqual(['chat', 'game', 'live', 'talk']);
  expect(ids(db.select({ id: players.lobbyId }).from(players).all())).toEqual(['game', 'live', 'talk']);
  expect(ids(db.select({ id: games.lobbyId }).from(games).all())).toEqual(['game']);
  expect(
    db
      .select({ body: messages.body })
      .from(messages)
      .all()
      .map((m) => m.body),
  ).toContain('vieux');

  // Un an plus tard, le message a expiré : la ligne vide disparaît.
  purgeExpired(db, now + MESSAGE_RETENTION_MS + 1, {
    tables: new Set(['game', 'live', 'talk']),
    users: new Set(['v']),
  });
  expect(ids(db.select({ id: lobbies.id }).from(lobbies).all())).toEqual(['game', 'live', 'talk']);
});
