// Schéma SQLite : uniquement des tables, contraintes et index. Aucun trigger : toute la
// logique vit dans l'API.
//
// Correspondances avec les types de l'API :
// - dates : entier en millisecondes depuis l'époque Unix (`Date` côté Drizzle) ;
// - booléens : 0 / 1 ; JSON : texte (`state` des manches) ;
// - identifiants des tables de jeu : UUID générés par l'API.

import type { GameSnapshot } from '@el-presidente/game';
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Instant courant en millisecondes, calculé par SQLite (valeur par défaut des colonnes). */
const nowMs = sql`(cast(unixepoch('subsec') * 1000 as integer))`;

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () => timestamp('created_at').notNull().default(nowMs);
const updatedAt = () =>
  timestamp('updated_at')
    .notNull()
    .default(nowMs)
    .$onUpdate(() => new Date());
const uuid = (name: string) => text(name).$defaultFn(() => crypto.randomUUID());

// ---------------------------------------------------------------------------
// Authentification (tables attendues par better-auth)
// ---------------------------------------------------------------------------

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
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

export const account = sqliteTable(
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
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
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

export const lobbies = sqliteTable(
  'lobbies',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull().unique(),
    hostId: text('host_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status', { enum: LOBBY_STATUSES }).notNull().default('waiting'),
    roundNo: integer('round_no').notNull().default(0),
    notice: text('notice'),
    /** Délai par tour en secondes ; null = pas de passe automatique. */
    turnLimit: integer('turn_limit'),
    /** Variante : interdit de finir sur un 2 (qui sort sur un 2 finit en bas du classement). */
    noTwoFinish: integer('no_two_finish', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('lobbies_status_check', sql`${t.status} in ('waiting', 'exchange', 'playing', 'finished')`),
    check('lobbies_turn_limit_check', sql`${t.turnLimit} is null or ${t.turnLimit} between 10 and 600`),
    index('lobbies_updated_at_idx').on(t.updatedAt),
  ],
);

export const players = sqliteTable(
  'players',
  {
    lobbyId: text('lobby_id')
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
    // `lower` de SQLite ne replie que l'ASCII : la vérification complète (toLowerCase)
    // est faite par l'API, sous le verrou de la table ; l'index n'est qu'un garde-fou.
    uniqueIndex('players_lobby_name_key').on(t.lobbyId, sql`lower(${t.name})`),
    index('players_user_id_idx').on(t.userId),
    check('players_seat_check', sql`${t.seat} >= 0`),
    check('players_name_check', sql`length(${t.name}) between 1 and 20`),
    check(
      'players_role_check',
      sql`${t.role} is null or ${t.role} in ('president', 'vice_president', 'neutral', 'vice_trou', 'trou')`,
    ),
  ],
);

/** Manche en cours (ou dernière terminée) d'une table, réécrite par l'écriture groupée. */
export const games = sqliteTable('games', {
  lobbyId: text('lobby_id')
    .primaryKey()
    .references(() => lobbies.id, { onDelete: 'cascade' }),
  roundNo: integer('round_no').notNull(),
  /** Version de la table au moment de l'écriture (garde-fou contre les écritures en retard). */
  version: integer('version').notNull(),
  state: text('state', { mode: 'json' }).$type<GameSnapshot>().notNull(),
  /** Échéance de la passe automatique, null si désactivée ou sans objet. */
  deadlineAt: timestamp('deadline_at'),
  updatedAt: updatedAt(),
});

export const messages = sqliteTable(
  'messages',
  {
    // AUTOINCREMENT : un identifiant n'est jamais réutilisé (curseur `after` des clients).
    id: integer('id').primaryKey({ autoIncrement: true }),
    lobbyId: text('lobby_id')
      .notNull()
      .references(() => lobbies.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    body: text('body').notNull(),
    /** Adresse de l'auteur (LCEN). */
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_lobby_id_idx').on(t.lobbyId, t.id),
    index('messages_user_id_idx').on(t.userId, t.createdAt),
    check('messages_body_check', sql`length(${t.body}) between 1 and 300`),
  ],
);

export const messageReports = sqliteTable(
  'message_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    messageId: integer('message_id')
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

export const pushSubscriptions = sqliteTable(
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
