import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';
import { games, lobbies, messages, players, user } from './schema';
import { createTestDatabase } from './testing';

const rows = (x: unknown) => ((x as { rows?: { n: number }[] }).rows ?? (x as { n: number }[]))[0]!.n;

let t: Awaited<ReturnType<typeof createTestDatabase>>;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(() => t.close());

const failsWith = async (p: Promise<unknown>, pattern: RegExp) => {
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  expect(
    String((error as Error)?.message ?? error) + String((error as { cause?: Error })?.cause?.message ?? ''),
  ).toMatch(pattern);
};

describe('schéma (PGlite + migrations réelles)', () => {
  test('tables, contraintes et cascade', async () => {
    const { db } = t;
    await db.insert(user).values([
      { id: 'u1', name: 'Ana', email: 'ana@example.com' },
      { id: 'u2', name: 'Beto', email: 'beto@example.com' },
    ]);
    const [lobby] = await db.insert(lobbies).values({ code: 'ABCDE', hostId: 'u1' }).returning();
    await db.insert(players).values({ lobbyId: lobby!.id, userId: 'u1', seat: 0, name: 'Ana' });

    // Nom unique à la table, sans tenir compte de la casse ; siège unique.
    await failsWith(
      db.insert(players).values({ lobbyId: lobby!.id, userId: 'u2', seat: 1, name: 'ANA' }),
      /players_lobby_name_key/,
    );
    await failsWith(
      db.insert(players).values({ lobbyId: lobby!.id, userId: 'u2', seat: 0, name: 'Beto' }),
      /players_lobby_seat_key/,
    );
    await failsWith(db.update(lobbies).set({ turnLimit: 5 }), /lobbies_turn_limit_check/);
    await failsWith(
      db.insert(messages).values({ lobbyId: lobby!.id, userId: 'u1', name: 'Ana', body: 'x'.repeat(301) }),
      /messages_body_check/,
    );

    const [m] = await db
      .insert(messages)
      .values({ lobbyId: lobby!.id, userId: 'u1', name: 'Ana', body: '¡Hola!', ip: '203.0.113.7' })
      .returning();
    expect(m!.ip).toBe('203.0.113.7');

    await db.delete(lobbies).where(eq(lobbies.id, lobby!.id));
    expect(await db.$count(players)).toBe(0);
    expect(await db.$count(messages)).toBe(0);
  });

  test('réglages de stockage de la table des manches', async () => {
    const r = await t.query<{ reloptions: string[] }>(`select reloptions from pg_class where relname = 'games'`);
    expect(r[0]!.reloptions).toContain('fillfactor=70');
    expect(await t.db.$count(games)).toBe(0);
  });

  test('aucune fonction ni trigger applicatif dans la base', async () => {
    const r = await t.db.execute<{ n: number }>(sql`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog', 'information_schema', 'drizzle')`);
    const triggers = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_trigger where not tgisinternal`,
    );
    expect(rows(r)).toBe(0);
    expect(rows(triggers)).toBe(0);
  });
});
