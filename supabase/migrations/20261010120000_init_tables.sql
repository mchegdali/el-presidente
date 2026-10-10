-- El Presidente : schéma et logique de jeu.
--
-- Toute la logique tourne ici, dans des fonctions SECURITY DEFINER appelées
-- via l'API RPC de Supabase. Les tables ne sont pas lisibles par les clients
-- (RLS activé, aucune policy) : chaque joueur ne reçoit que sa propre main via
-- get_state(). Un joueur est identifié par un jeton secret généré dans son
-- navigateur ; seul son hash est stocké.
--
-- Cartes : 2 caractères, valeur puis couleur. Valeurs dans l'ordre du jeu
-- '3456789TJQKA2' (T = 10), couleurs S (pique), H (cœur), D (carreau), C (trèfle).

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid,
  status text not null default 'waiting'
    check (status in ('waiting', 'exchange', 'playing', 'finished')),
  round_no integer not null default 0,
  version bigint not null default 0,
  notice text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  name text not null,
  token_hash text not null,
  seat integer not null,
  role text check (role in ('president', 'vice_president', 'neutral', 'vice_trou', 'trou')),
  created_at timestamptz not null default now(),
  unique (lobby_id, token_hash)
);

create index players_lobby_id_idx on public.players (lobby_id);

-- Une ligne par table : la manche en cours (ou la dernière terminée).
create table public.games (
  lobby_id uuid primary key references public.lobbies (id) on delete cascade,
  round_no integer not null,
  phase text not null check (phase in ('exchange', 'playing', 'over')),
  seats uuid[] not null,                       -- ordre de jeu
  hands jsonb not null,                        -- { player_id: [cartes] } — privé
  turn uuid,
  trick jsonb not null default '[]'::jsonb,    -- [{p, c: [cartes]} | {p, pass: true}]
  trick_size integer not null default 0,       -- 0 = pli à ouvrir
  trick_rank integer not null default 0,
  last_player uuid,
  passes integer not null default 0,           -- passes consécutives depuis le dernier coup
  prev_trick jsonb not null default '[]'::jsonb,
  prev_winner uuid,
  finished uuid[] not null default '{}',       -- ordre de sortie
  exchanges jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  event_seq integer not null default 0
);

alter table public.lobbies enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
