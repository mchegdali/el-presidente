import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createDatabase } from './index';
import { lobbies, messages, players, user } from './schema';
import { createTestDatabase } from './testing';

const t = createTestDatabase();
afterAll(() => t.close());

const failsWith = (run: () => unknown, pattern: RegExp) => expect(run).toThrow(pattern);

describe('schéma (SQLite + migrations réelles)', () => {
  test('tables, contraintes et cascade', async () => {
    const { db } = t;
    db.insert(user)
      .values([
        { id: 'u1', name: 'Ana', email: 'ana@example.com' },
        { id: 'u2', name: 'Beto', email: 'beto@example.com' },
      ])
      .run();
    const lobby = db.insert(lobbies).values({ code: 'ABCDE', hostId: 'u1' }).returning().get();
    expect(lobby.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(lobby.createdAt).toBeInstanceOf(Date);
    expect(Math.abs(lobby.createdAt.getTime() - Date.now())).toBeLessThan(5000);
    db.insert(players).values({ lobbyId: lobby.id, userId: 'u1', seat: 0, name: 'Ana' }).run();

    // Nom unique à la table, sans tenir compte de la casse ; siège unique.
    failsWith(
      () => db.insert(players).values({ lobbyId: lobby.id, userId: 'u2', seat: 1, name: 'ANA' }).run(),
      /players_lobby_name_key|UNIQUE constraint failed: index/,
    );
    failsWith(
      () => db.insert(players).values({ lobbyId: lobby.id, userId: 'u2', seat: 0, name: 'Beto' }).run(),
      /UNIQUE constraint failed: players\.lobby_id, players\.seat/,
    );
    failsWith(() => db.update(lobbies).set({ turnLimit: 5 }).run(), /lobbies_turn_limit_check/);
    failsWith(
      () =>
        db
          .insert(messages)
          .values({ lobbyId: lobby.id, userId: 'u1', name: 'Ana', body: 'x'.repeat(301) })
          .run(),
      /messages_body_check/,
    );
    // Clés étrangères actives (désactivées par défaut dans SQLite).
    failsWith(
      () => db.insert(players).values({ lobbyId: 'inconnu', userId: 'u2', seat: 1, name: 'Beto' }).run(),
      /FOREIGN KEY constraint failed/,
    );

    const m = db
      .insert(messages)
      .values({ lobbyId: lobby.id, userId: 'u1', name: 'Ana', body: '¡Hola!', ip: '203.0.113.7' })
      .returning()
      .get();
    expect(m.ip).toBe('203.0.113.7');

    db.delete(lobbies).where(eq(lobbies.id, lobby.id)).run();
    expect(await db.$count(players)).toBe(0);
    expect(await db.$count(messages)).toBe(0);
  });

  test("une erreur au milieu d'une transaction n'en laisse aucune trace", () => {
    const { db } = t;
    const lobby = db.insert(lobbies).values({ code: 'ROLLB', hostId: 'u1' }).returning().get();
    expect(() =>
      db.transaction((tx) => {
        tx.insert(players).values({ lobbyId: lobby.id, userId: 'u2', seat: 0, name: 'Beto' }).run();
        tx.update(lobbies).set({ hostId: 'u2' }).where(eq(lobbies.id, lobby.id)).run();
        throw new Error('panne simulée');
      }),
    ).toThrow('panne simulée');
    expect(db.select().from(players).where(eq(players.lobbyId, lobby.id)).all()).toEqual([]);
    expect(db.select().from(lobbies).where(eq(lobbies.id, lobby.id)).get()?.hostId).toBe('u1');
  });

  test('aucun trigger ni vue dans la base', () => {
    const r = t.sqlite.query(`select count(*) as n from sqlite_schema where type in ('trigger', 'view')`).get() as {
      n: number;
    };
    expect(r.n).toBe(0);
  });
});

describe('réglages de connexion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'presidente-db-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('fichier : WAL, synchronous NORMAL, clés étrangères, attente sur verrou', () => {
    const file = createDatabase(join(dir, 'test.db'));
    const pragma = (name: string) => Object.values(file.sqlite.query(`PRAGMA ${name}`).get() as object)[0];
    expect(pragma('journal_mode')).toBe('wal');
    expect(pragma('synchronous')).toBe(1); // NORMAL
    expect(pragma('foreign_keys')).toBe(1);
    expect(pragma('busy_timeout')).toBe(5000);
    file.close();
    // Réouverture : les migrations déjà appliquées ne sont pas rejouées.
    createDatabase(join(dir, 'test.db')).close();
  });
});
