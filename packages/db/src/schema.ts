// Schéma Postgres : uniquement des tables, contraintes et index. Aucune fonction, aucun
// trigger : toute la logique vit dans l'API.

import type { GameSnapshot } from '@el-presidente/game';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Authentification (tables attendues par better-auth)
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Conservée pour l'identification des auteurs de contenus (LCEN). */
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Jeu
// ---------------------------------------------------------------------------

export const LOBBY_STATUSES = ['waiting', 'exchange', 'playing', 'finished'] as const;
export const ROLES = ['president', 'vice_president', 'neutral', 'vice_trou', 'trou'] as const;

export const lobbies = pgTable(
  'lobbies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    hostId: text('host_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status', { enum: LOBBY_STATUSES }).notNull().default('waiting'),
    roundNo: integer('round_no').notNull().default(0),
    notice: text('notice'),
    /** Délai par tour en secondes ; null = pas de passe automatique. */
    turnLimit: integer('turn_limit'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('lobbies_status_check', sql`${t.status} in ('waiting', 'exchange', 'playing', 'finished')`),
    check('lobbies_turn_limit_check', sql`${t.turnLimit} is null or ${t.turnLimit} between 10 and 600`),
    index('lobbies_updated_at_idx').on(t.updatedAt),
  ],
);

export const players = pgTable(
  'players',
  {
    lobbyId: uuid('lobby_id')
      .notNull()
      .references(() => lobbies.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    name: text('name').notNull(),
    role: text('role', { enum: ROLES }),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.lobbyId, t.userId] }),
    unique('players_lobby_seat_key').on(t.lobbyId, t.seat),
    uniqueIndex('players_lobby_name_key').on(t.lobbyId, sql`lower(${t.name})`),
    index('players_user_id_idx').on(t.userId),
    check('players_seat_check', sql`${t.seat} between 0 and 7`),
    check('players_name_check', sql`length(${t.name}) between 1 and 20`),
    check(
      'players_role_check',
      sql`${t.role} is null or ${t.role} in ('president', 'vice_president', 'neutral', 'vice_trou', 'trou')`,
    ),
  ],
);

/**
 * Manche en cours (ou dernière terminée) d'une table. Réécrite à chaque coup : aucune
 * colonne indexée n'y change, et le fillfactor laisse de la place dans la page, d'où des
 * mises à jour HOT (sans toucher aux index). Voir la migration 0001.
 */
export const games = pgTable('games', {
  lobbyId: uuid('lobby_id')
    .primaryKey()
    .references(() => lobbies.id, { onDelete: 'cascade' }),
  roundNo: integer('round_no').notNull(),
  /** Version de la table au moment de l'écriture (garde-fou contre les écritures en retard). */
  version: bigint('version', { mode: 'number' }).notNull(),
  state: jsonb('state').$type<GameSnapshot>().notNull(),
  /** Échéance de la passe automatique, null si désactivée ou sans objet. */
  deadlineAt: timestamp('deadline_at', { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const messages = pgTable(
  'messages',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    lobbyId: uuid('lobby_id')
      .notNull()
      .references(() => lobbies.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    body: text('body').notNull(),
    /** Adresse de l'auteur (LCEN). */
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_lobby_id_idx').on(t.lobbyId, t.id),
    index('messages_user_id_idx').on(t.userId, t.createdAt),
    check('messages_body_check', sql`length(${t.body}) between 1 and 300`),
  ],
);

export const messageReports = pgTable(
  'message_reports',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    messageId: bigint('message_id', { mode: 'number' })
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    reporterId: text('reporter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('message_reports_once_key').on(t.messageId, t.reporterId),
    check('message_reports_reason_check', sql`${t.reason} is null or length(${t.reason}) <= 500`),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('push_subscriptions_user_id_idx').on(t.userId),
    check('push_subscriptions_endpoint_check', sql`${t.endpoint} like 'https://%' and length(${t.endpoint}) <= 1000`),
  ],
);

export type User = typeof user.$inferSelect;
export type Lobby = typeof lobbies.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Message = typeof messages.$inferSelect;
