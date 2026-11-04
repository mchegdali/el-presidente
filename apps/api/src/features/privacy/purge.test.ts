import { afterAll, expect, test } from 'bun:test';
import { schema } from '@el-presidente/db';
import { createTestDatabase } from '@el-presidente/db/testing';
import { MESSAGE_RETENTION_MS, purgeExpired } from './purge';

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

  expect(purgeExpired(db, now)).toEqual({ messages: 1, sessions: 1, verifications: 1 });
  expect(db.select({ id: schema.messages.id }).from(schema.messages).all()).toEqual([{ id: b!.id }]);
  expect(db.select().from(schema.messageReports).all()).toEqual([]);
  expect(db.select({ id: schema.session.id }).from(schema.session).all()).toEqual([{ id: 's2' }]);
  expect(purgeExpired(db, now)).toEqual({ messages: 0, sessions: 0, verifications: 0 });
});
