-- El Presidente : correction de « carte ou rien », passe automatique (délai réglé par
-- l'hôte), présence des joueurs, chat, emotes et notifications push.
--
-- Les nouvelles données (messages, abonnements push, file d'envoi, configuration)
-- sont dans le schéma `private`, jamais exposé par l'API : on n'y accède que par
-- les fonctions RPC ci-dessous ou, pour l'envoi des notifications, par l'Edge
-- Function `push` (connexion directe à la base).

-- ---------------------------------------------------------------------------
-- Schéma
-- ---------------------------------------------------------------------------

alter table public.lobbies
  add column turn_limit integer check (turn_limit is null or turn_limit between 10 and 600);

alter table public.games
  add column turn_started timestamptz not null default now();

alter table public.players
  add column last_seen timestamptz,          -- dernier signe de vie d'un onglet visible
  add column notified_turn timestamptz,      -- tour (turn_started) déjà notifié par push
  add column emote text,
  add column emote_at timestamptz;

create table private.messages (
  id bigint generated always as identity primary key,
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index messages_lobby_id_idx on private.messages (lobby_id, id);
create index messages_player_id_idx on private.messages (player_id, created_at);

create table private.push_subscriptions (
  player_id uuid primary key references public.players (id) on delete cascade,
  endpoint text,
  p256dh text,
  auth text,
  updated_at timestamptz not null default now()
);

create table private.push_queue (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index push_queue_pending_idx on private.push_queue (created_at) where sent_at is null;

-- Clés VAPID et URL de l'Edge Function, renseignées hors dépôt (voir README).
create table private.config (
  key text primary key,
  value text not null
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function private.epoch_ms(t timestamptz)
returns bigint language sql immutable set search_path = '' as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

create or replace function private.is_online(p public.players)
returns boolean language sql stable set search_path = '' as $$
  select p.last_seen is not null and p.last_seen > now() - interval '30 seconds'
$$;

-- Message volontairement unique : on ne dit pas si la table a existé.
create or replace function private.lock_lobby(p_code text)
returns public.lobbies language plpgsql set search_path = '' as $$
declare
  l public.lobbies;
begin
  select * into l from public.lobbies where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  return l;
end $$;

-- Chaque coup relance le chrono du tour.
create or replace function private.save_game(g public.games)
returns void language sql set search_path = '' as $$
  update public.games set
    phase = g.phase, hands = g.hands, turn = g.turn, trick = g.trick,
    trick_size = g.trick_size, trick_rank = g.trick_rank, last_player = g.last_player,
    passes = g.passes, prev_trick = g.prev_trick, prev_winner = g.prev_winner,
    finished = g.finished, exchanges = g.exchanges, events = g.events, event_seq = g.event_seq,
    turn_started = now()
  where lobby_id = g.lobby_id
$$;

-- Réveille l'Edge Function qui envoie les notifications en attente.
create or replace function private.poke_push()
returns void language plpgsql set search_path = '' as $$
declare
  v_url text;
begin
  select value into v_url from private.config where key = 'push_url';
  if v_url is null then
    return;
  end if;
  begin
    perform net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := '{"Content-Type": "application/json"}'::jsonb);
  exception when others then
    null;
  end;
end $$;

-- Met en file une notification « à vous de jouer » pour les joueurs qui doivent agir
-- et dont l'onglet n'est pas au premier plan. Une seule notification par tour.
create or replace function private.notify_turn(p_lobby uuid)
returns void language plpgsql set search_path = '' as $$
declare
  g public.games;
  v_code text;
  v_count integer;
begin
  select * into g from public.games where lobby_id = p_lobby;
  if not found or g.phase not in ('playing', 'exchange') then
    return;
  end if;
  select code into v_code from public.lobbies where id = p_lobby;

  with targets as (
    select p.id
    from public.players p
    join private.push_subscriptions s on s.player_id = p.id and s.endpoint is not null
    where p.lobby_id = p_lobby
      and not private.is_online(p)
      and p.notified_turn is distinct from g.turn_started
      and ((g.phase = 'playing' and p.id = g.turn)
           or (g.phase = 'exchange' and exists (
                 select 1 from jsonb_array_elements(g.exchanges) e
                 where (e ->> 'from')::uuid = p.id and not (e ->> 'done')::boolean)))
  ), marked as (
    update public.players p set notified_turn = g.turn_started
    from targets t where p.id = t.id
    returning p.id
  )
  insert into private.push_queue (player_id, title, body, url)
  select id,
         '¡Te toca! À vous de jouer',
         case when g.phase = 'exchange' then 'Choisissez les cartes à donner (table ' || v_code || ').'
              else 'C''est votre tour à la table ' || v_code || '.' end,
         '/t/' || v_code
  from marked;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.poke_push();
  end if;
end $$;

-- Incrémente la version, prévient les clients et notifie les joueurs absents.
create or replace function private.touch(p_lobby uuid)
returns void language plpgsql set search_path = '' as $$
declare
  v bigint;
begin
  update public.lobbies set version = version + 1, updated_at = now()
  where id = p_lobby returning version into v;
  begin
    perform realtime.send(jsonb_build_object('version', v), 'state', 'lobby:' || p_lobby::text, false);
  exception when others then
    -- Le temps réel est un confort : les clients se resynchronisent aussi par polling.
    null;
  end;
  begin
    perform private.notify_turn(p_lobby);
  exception when others then
    null;
  end;
end $$;

create or replace function private.broadcast(p_lobby uuid, p_event text, p_payload jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  perform realtime.send(p_payload, p_event, 'lobby:' || p_lobby::text, false);
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Coups (communs aux actions des joueurs et à la passe automatique)
-- ---------------------------------------------------------------------------

create or replace function private.apply_play(g public.games, p_player uuid, p_cards text[])
returns public.games language plpgsql set search_path = '' as $$
declare
  k integer := coalesce(cardinality(p_cards), 0);
  r integer;
  v_same integer;
  v_reason text;
  v_prev jsonb;
  v_last jsonb;
  v_forced integer;
begin
  if g.phase <> 'playing' then
    raise exception 'Aucune manche en cours.';
  end if;
  if g.turn is distinct from p_player then
    raise exception 'Ce n''est pas votre tour.';
  end if;
  if k < 1 or k > 4 then
    raise exception 'Choisissez entre 1 et 4 cartes.';
  end if;
  if (select count(distinct c) from unnest(p_cards) c) <> k
     or (select count(*) from jsonb_array_elements_text(g.hands -> p_player::text) c
         where c = any (p_cards)) <> k then
    raise exception 'Vous n''avez pas ces cartes.';
  end if;
  if (select count(distinct private.card_rank(c)) from unnest(p_cards) c) <> 1 then
    raise exception 'Les cartes jouées doivent avoir la même valeur.';
  end if;

  r := private.card_rank(p_cards[1]);
  if g.trick_size > 0 then
    if k <> g.trick_size then
      raise exception '%', case g.trick_size
        when 1 then 'Ce pli se joue en cartes simples.'
        when 2 then 'Ce pli se joue en paires.'
        when 3 then 'Ce pli se joue en brelans.'
        else 'Ce pli se joue en carrés.' end;
    end if;
    -- Carte ou rien : en simples, si les deux dernières actions du pli sont deux
    -- cartes de même valeur, on ne peut suivre qu'avec cette valeur (ou passer).
    -- Une passe entre-temps lève la contrainte.
    if g.trick_size = 1 and jsonb_array_length(g.trick) >= 2 then
      v_prev := g.trick -> -2;
      v_last := g.trick -> -1;
      if v_prev ? 'c' and v_last ? 'c'
         and private.card_rank(v_prev -> 'c' ->> 0) = private.card_rank(v_last -> 'c' ->> 0) then
        v_forced := private.card_rank(v_last -> 'c' ->> 0);
        if r <> v_forced then
          raise exception '% ou rien : jouez cette valeur ou passez.', private.rank_label(v_forced);
        end if;
      end if;
    end if;
    if r < g.trick_rank then
      raise exception 'Il faut jouer une valeur égale ou supérieure.';
    end if;
  end if;

  g := private.remove_cards(g, p_player, p_cards);
  g.trick := g.trick || jsonb_build_array(jsonb_build_object('p', p_player, 'c', private.sorted_cards(p_cards)));
  g.trick_size := k;
  g.trick_rank := r;
  g.last_player := p_player;
  g.passes := 0;

  if private.hand_size(g, p_player) = 0 then
    g.finished := g.finished || p_player;
    g := private.push_event(g, jsonb_build_object(
      'type', 'finished', 'player', p_player, 'position', cardinality(g.finished)));
  end if;

  -- Coupe à 4 : les quatre cartes de la valeur sont sur le pli. Le 2 ferme le pli.
  select count(*) into v_same
  from jsonb_array_elements(g.trick) pl, jsonb_array_elements_text(pl -> 'c') c
  where private.card_rank(c) = r;
  if v_same >= 4 then
    v_reason := 'cut';
  elsif r = 13 then
    v_reason := 'two';
  end if;
  if v_reason is not null then
    g := private.push_event(g, jsonb_build_object('type', v_reason, 'player', p_player));
  end if;

  if private.active_count(g) <= 1 then
    g := private.finish_round(g);
  elsif v_reason is not null then
    g := private.close_trick(g, p_player);
  else
    g.turn := private.next_active(g, p_player);
  end if;
  return g;
end $$;

create or replace function private.apply_pass(g public.games, p_player uuid)
returns public.games language plpgsql set search_path = '' as $$
declare
  v_needed integer;
begin
  if g.phase <> 'playing' then
    raise exception 'Aucune manche en cours.';
  end if;
  if g.turn is distinct from p_player then
    raise exception 'Ce n''est pas votre tour.';
  end if;
  if g.trick_size = 0 then
    raise exception 'Vous ouvrez le pli : vous devez jouer.';
  end if;

  g.trick := g.trick || jsonb_build_array(jsonb_build_object('p', p_player, 'pass', true));
  g.passes := g.passes + 1;
  -- Le pli est remporté quand tous les autres joueurs encore en jeu ont passé.
  v_needed := private.active_count(g)
    - case when private.hand_size(g, g.last_player) > 0 then 1 else 0 end;
  if g.passes >= v_needed then
    g := private.push_event(g, jsonb_build_object('type', 'won', 'player', g.last_player));
    g := private.close_trick(g, g.last_player);
  else
    g.turn := private.next_active(g, p_player);
  end if;
  return g;
end $$;

create or replace function private.apply_give(g public.games, p_player uuid, p_cards text[])
returns public.games language plpgsql set search_path = '' as $$
declare
  k integer := coalesce(cardinality(p_cards), 0);
  idx integer;
  e jsonb;
begin
  if g.phase <> 'exchange' then
    raise exception 'Il n''y a pas d''échange en cours.';
  end if;
  for i in 0 .. jsonb_array_length(g.exchanges) - 1 loop
    if (g.exchanges -> i ->> 'from')::uuid = p_player and not (g.exchanges -> i ->> 'done')::boolean then
      idx := i;
      exit;
    end if;
  end loop;
  if idx is null then
    raise exception 'Vous n''avez pas de cartes à donner.';
  end if;
  e := g.exchanges -> idx;

  if k <> (e ->> 'count')::integer then
    raise exception 'Choisissez exactement % carte(s) à donner.', e ->> 'count';
  end if;
  if (select count(distinct c) from unnest(p_cards) c) <> k
     or (select count(*) from jsonb_array_elements_text(g.hands -> p_player::text) c
         where c = any (p_cards)) <> k then
    raise exception 'Vous n''avez pas ces cartes.';
  end if;

  g := private.remove_cards(g, p_player, p_cards);
  g := private.add_cards(g, (e ->> 'to')::uuid, p_cards);
  g.exchanges := jsonb_set(g.exchanges, array[idx::text],
    e || jsonb_build_object('cards', private.sorted_cards(p_cards), 'done', true));

  if not exists (select 1 from jsonb_array_elements(g.exchanges) x where not (x ->> 'done')::boolean) then
    g.phase := 'playing';
    update public.lobbies set status = 'playing' where id = g.lobby_id;
    g := private.push_event(g, jsonb_build_object('type', 'exchange_done', 'player', g.turn));
  end if;
  return g;
end $$;

-- Délai dépassé : le joueur passe ; s'il ouvre le pli, sa plus petite carte est jouée ;
-- pendant l'échange, les retardataires donnent leurs cartes les plus faibles.
create or replace function private.auto_move(g public.games)
returns public.games language plpgsql set search_path = '' as $$
declare
  e jsonb;
  v_from uuid;
begin
  if g.phase = 'exchange' then
    for e in select x from jsonb_array_elements(g.exchanges) x where not (x ->> 'done')::boolean loop
      v_from := (e ->> 'from')::uuid;
      g := private.push_event(g, jsonb_build_object('type', 'timeout', 'player', v_from, 'action', 'give'));
      g := private.apply_give(g, v_from, array(
        select c from jsonb_array_elements_text(g.hands -> v_from::text) c
        order by private.card_order(c) limit (e ->> 'count')::integer));
    end loop;
  elsif g.phase = 'playing' then
    v_from := g.turn;
    if g.trick_size = 0 then
      g := private.push_event(g, jsonb_build_object('type', 'timeout', 'player', v_from, 'action', 'play'));
      g := private.apply_play(g, v_from, array(
        select c from jsonb_array_elements_text(g.hands -> v_from::text) c
        order by private.card_order(c) limit 1));
    else
      g := private.push_event(g, jsonb_build_object('type', 'timeout', 'player', v_from, 'action', 'pass'));
      g := private.apply_pass(g, v_from);
    end if;
  end if;
  return g;
end $$;

-- Applique la passe automatique si le délai de la table est dépassé. Renvoie true si
-- un coup a été joué. L'appelant doit avoir verrouillé la table.
create or replace function private.try_timeout(p_lobby uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_limit integer;
  g public.games;
begin
  select turn_limit into v_limit from public.lobbies where id = p_lobby;
  if v_limit is null then
    return false;
  end if;
  select * into g from public.games where lobby_id = p_lobby for update;
  if not found or g.phase not in ('playing', 'exchange')
     or now() < g.turn_started + make_interval(secs => v_limit) then
    return false;
  end if;
  g := private.auto_move(g);
  perform private.save_game(g);
  perform private.touch(p_lobby);
  return true;
end $$;

-- Filet de sécurité côté serveur (pg_cron) : applique les délais même si aucun
-- joueur n'a la page ouverte, et relance l'envoi des notifications en attente.
create or replace function private.sweep()
returns void language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select g.lobby_id from public.games g join public.lobbies l on l.id = g.lobby_id
    where l.turn_limit is not null and g.phase in ('playing', 'exchange')
      and now() >= g.turn_started + make_interval(secs => l.turn_limit)
  loop
    begin
      perform 1 from public.lobbies where id = v_id for update;
      perform private.try_timeout(v_id);
    exception when others then
      null;
    end;
  end loop;
  if exists (select 1 from private.push_queue
             where sent_at is null and created_at > now() - interval '2 minutes') then
    perform private.poke_push();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- API publique (RPC)
-- ---------------------------------------------------------------------------

create or replace function public.get_state(p_code text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  v_players jsonb;
  v_game jsonb;
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  select * into me from public.players
  where lobby_id = l.id and token_hash = private.hash_token(p_token);
  select * into g from public.games where lobby_id = l.id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'seat', p.seat,
      'role', p.role,
      'cards', private.hand_size(g, p.id),
      'position', array_position(g.finished, p.id),
      'online', private.is_online(p),
      'emote', case when p.emote_at > now() - interval '5 seconds' then p.emote end,
      'emote_at', case when p.emote_at > now() - interval '5 seconds' then private.epoch_ms(p.emote_at) end
    ) order by p.seat), '[]'::jsonb)
  into v_players
  from public.players p where p.lobby_id = l.id;

  if g.lobby_id is not null then
    v_game := jsonb_build_object(
      'phase', g.phase,
      'round_no', g.round_no,
      'seats', to_jsonb(g.seats),
      'turn', g.turn,
      'turn_started', private.epoch_ms(g.turn_started),
      'trick', g.trick,
      'trick_size', g.trick_size,
      'trick_rank', g.trick_rank,
      'last_player', g.last_player,
      'passes', g.passes,
      'prev_trick', g.prev_trick,
      'prev_winner', g.prev_winner,
      'finished', to_jsonb(g.finished),
      'exchanges', (
        select coalesce(jsonb_agg(
          case when me.id is not null and me.id in ((e ->> 'from')::uuid, (e ->> 'to')::uuid)
               then e else e - 'cards' end), '[]'::jsonb)
        from jsonb_array_elements(g.exchanges) e),
      'events', g.events
    );
  end if;

  return jsonb_build_object(
    'lobby', jsonb_build_object(
      'id', l.id,
      'code', l.code,
      'status', l.status,
      'round_no', l.round_no,
      'version', l.version,
      'host_id', l.host_id,
      'notice', l.notice,
      'turn_limit', l.turn_limit,
      'chat_last', case when me.id is not null then
        (select max(id) from private.messages m where m.lobby_id = l.id) end
    ),
    'me', me.id,
    'now', private.epoch_ms(now()),
    'players', v_players,
    'game', v_game,
    'hand', case when me.id is not null then coalesce(g.hands -> me.id::text, '[]'::jsonb) end
  );
end $$;

create or replace function public.start_round(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  n integer;
  v_seats uuid[];
  v_deck text[];
  v_offset integer;
  v_pres uuid;
  v_vp uuid;
  v_vt uuid;
  v_trou uuid;
  v_best text[];
  v_exchanges jsonb := '[]'::jsonb;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  if l.host_id is distinct from me.id then
    raise exception 'Seul le créateur de la table peut lancer la manche.';
  end if;
  if l.status in ('exchange', 'playing') then
    raise exception 'Une manche est déjà en cours.';
  end if;

  v_seats := array(select id from public.players where lobby_id = l.id order by seat);
  n := cardinality(v_seats);
  if n < 3 then
    raise exception 'Il faut au moins 3 joueurs pour commencer.';
  end if;
  if n > 8 then
    raise exception 'Pas plus de 8 joueurs.';
  end if;

  -- Distribution : 52 cartes mélangées, données une par une.
  v_deck := array(
    select r || s
    from unnest(string_to_array('3,4,5,6,7,8,9,T,J,Q,K,A,2', ',')) r
    cross join unnest(array['S', 'H', 'D', 'C']) s
    order by random());
  v_offset := floor(random() * n)::integer;

  g.lobby_id := l.id;
  g.round_no := l.round_no + 1;
  g.seats := v_seats;
  g.hands := (
    select jsonb_object_agg(pid::text, cards)
    from (
      select v_seats[((i - 1 + v_offset) % n) + 1] as pid,
             jsonb_agg(card order by private.card_order(card)) as cards
      from unnest(v_deck) with ordinality d(card, i)
      group by 1
    ) x);
  g.turn := null;
  g.trick := '[]'::jsonb;
  g.trick_size := 0;
  g.trick_rank := 0;
  g.last_player := null;
  g.passes := 0;
  g.prev_trick := '[]'::jsonb;
  g.prev_winner := null;
  g.finished := '{}';
  g.events := '[]'::jsonb;
  g.event_seq := 0;
  g.turn_started := now();

  -- Échanges selon les rôles de la manche précédente.
  select id into v_pres from public.players where lobby_id = l.id and role = 'president' limit 1;
  select id into v_trou from public.players where lobby_id = l.id and role = 'trou' limit 1;
  select id into v_vp from public.players where lobby_id = l.id and role = 'vice_president' limit 1;
  select id into v_vt from public.players where lobby_id = l.id and role = 'vice_trou' limit 1;

  if v_pres is not null and v_trou is not null then
    v_best := array(select c from jsonb_array_elements_text(g.hands -> v_trou::text) c
                    order by private.card_order(c) desc limit 2);
    g := private.remove_cards(g, v_trou, v_best);
    g := private.add_cards(g, v_pres, v_best);
    v_exchanges := v_exchanges
      || jsonb_build_array(jsonb_build_object('from', v_trou, 'to', v_pres, 'count', 2,
                                              'cards', private.sorted_cards(v_best), 'done', true))
      || jsonb_build_array(jsonb_build_object('from', v_pres, 'to', v_trou, 'count', 2,
                                              'cards', null, 'done', false));
  end if;
  if v_vp is not null and v_vt is not null then
    v_best := array(select c from jsonb_array_elements_text(g.hands -> v_vt::text) c
                    order by private.card_order(c) desc limit 1);
    g := private.remove_cards(g, v_vt, v_best);
    g := private.add_cards(g, v_vp, v_best);
    v_exchanges := v_exchanges
      || jsonb_build_array(jsonb_build_object('from', v_vt, 'to', v_vp, 'count', 1,
                                              'cards', private.sorted_cards(v_best), 'done', true))
      || jsonb_build_array(jsonb_build_object('from', v_vp, 'to', v_vt, 'count', 1,
                                              'cards', null, 'done', false));
  end if;
  g.exchanges := v_exchanges;
  g.phase := case when jsonb_array_length(v_exchanges) > 0 then 'exchange' else 'playing' end;

  -- Le Trou-du-cul commence ; à la première manche, celui qui a la Dame de cœur.
  g.turn := coalesce(v_trou, (select key::uuid from jsonb_each(g.hands) where value ? 'QH'));
  g := private.push_event(g, jsonb_build_object(
    'type', 'round_start', 'player', g.turn,
    'reason', case when v_trou is not null then 'trou' else 'queen' end));

  -- La ligne de la manche précédente est réécrite.
  insert into public.games select g.*
  on conflict (lobby_id) do update set
    round_no = excluded.round_no, phase = excluded.phase, seats = excluded.seats,
    hands = excluded.hands, turn = excluded.turn, trick = excluded.trick,
    trick_size = excluded.trick_size, trick_rank = excluded.trick_rank,
    last_player = excluded.last_player, passes = excluded.passes,
    prev_trick = excluded.prev_trick, prev_winner = excluded.prev_winner,
    finished = excluded.finished, exchanges = excluded.exchanges, events = excluded.events,
    event_seq = excluded.event_seq, turn_started = excluded.turn_started;
  update public.lobbies
  set status = g.phase, round_no = g.round_no, notice = null
  where id = l.id;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create or replace function public.give_cards(p_code text, p_token text, p_cards text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found then
    raise exception 'Il n''y a pas d''échange en cours.';
  end if;
  g := private.apply_give(g, me.id, p_cards);
  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create or replace function public.play_cards(p_code text, p_token text, p_cards text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found then
    raise exception 'Aucune manche en cours.';
  end if;
  g := private.apply_play(g, me.id, p_cards);
  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create or replace function public.pass_turn(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found then
    raise exception 'Aucune manche en cours.';
  end if;
  g := private.apply_pass(g, me.id);
  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

-- Appelée par n'importe quel joueur quand le chrono affiché arrive à zéro ;
-- le serveur vérifie lui-même que le délai est dépassé.
create or replace function public.claim_timeout(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
begin
  l := private.lock_lobby(p_code);
  perform private.require_player(l.id, p_token);
  perform private.try_timeout(l.id);
  return public.get_state(l.code, p_token);
end $$;

-- Délai par tour, en secondes (null ou 0 : désactivé). Réservé à l'hôte.
create or replace function public.set_turn_limit(p_code text, p_token text, p_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  v_limit integer := nullif(p_seconds, 0);
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  if l.host_id is distinct from me.id then
    raise exception 'Seul le créateur de la table peut régler le délai.';
  end if;
  if v_limit is not null and (v_limit < 10 or v_limit > 600) then
    raise exception 'Délai invalide (entre 10 secondes et 10 minutes).';
  end if;
  update public.lobbies set turn_limit = v_limit where id = l.id;
  -- Le nouveau délai part de maintenant pour le joueur en cours.
  update public.games set turn_started = now() where lobby_id = l.id;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

-- Signe de vie : true toutes les 15 s quand l'onglet est visible, false quand il passe
-- en arrière-plan ou se ferme (le joueur devient joignable par notification).
create or replace function public.ping(p_code text, p_token text, p_active boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  me := private.require_player(l.id, p_token);
  update public.players set last_seen = case when p_active then now() end where id = me.id;
  if not coalesce(p_active, false) then
    perform private.notify_turn(l.id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Enregistre (ou désactive, endpoint null) l'abonnement push du joueur pour cette table.
create or replace function public.save_push(p_code text, p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  me := private.require_player(l.id, p_token);
  if p_endpoint is not null and (
       p_endpoint !~ '^https://' or length(p_endpoint) > 1000
       or coalesce(length(p_p256dh), 0) not between 40 and 200
       or coalesce(length(p_auth), 0) not between 10 and 100) then
    raise exception 'Abonnement aux notifications invalide.';
  end if;
  insert into private.push_subscriptions (player_id, endpoint, p256dh, auth)
  values (me.id, p_endpoint, p_p256dh, p_auth)
  on conflict (player_id) do update set
    endpoint = excluded.endpoint, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select value from private.config where key = 'vapid_public'
$$;

create or replace function public.get_messages(p_code text, p_token text, p_after bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  l public.lobbies;
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  perform private.require_player(l.id, p_token);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'p', m.player_id, 'name', m.name, 'body', m.body,
        'at', private.epoch_ms(m.created_at)) order by m.id), '[]'::jsonb)
    from (
      select * from private.messages
      where lobby_id = l.id and id > coalesce(p_after, 0)
      order by id desc limit 100
    ) m);
end $$;

create or replace function public.send_message(p_code text, p_token text, p_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  v_body text := trim(coalesce(p_body, ''));
  m private.messages;
  v_msg jsonb;
  v_count integer;
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  me := private.require_player(l.id, p_token);
  if length(v_body) = 0 then
    raise exception 'Message vide.';
  end if;
  if length(v_body) > 300 then
    raise exception 'Message trop long (300 caractères max).';
  end if;
  if (select count(*) from private.messages
      where player_id = me.id and created_at > now() - interval '5 seconds') >= 4 then
    raise exception 'Doucement ! Attendez un peu avant d''envoyer un autre message.';
  end if;

  insert into private.messages (lobby_id, player_id, name, body)
  values (l.id, me.id, me.name, v_body) returning * into m;
  v_msg := jsonb_build_object('id', m.id, 'p', m.player_id, 'name', m.name, 'body', m.body,
                              'at', private.epoch_ms(m.created_at));
  perform private.broadcast(l.id, 'chat', v_msg);

  -- @mention : les joueurs mentionnés absents reçoivent une notification.
  insert into private.push_queue (player_id, title, body, url)
  select p.id, me.name || ' vous mentionne', left(v_body, 140), '/t/' || l.code
  from public.players p
  join private.push_subscriptions s on s.player_id = p.id and s.endpoint is not null
  where p.lobby_id = l.id and p.id <> me.id and not private.is_online(p)
    and strpos(lower(v_body), lower('@' || p.name)) > 0;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform private.poke_push();
  end if;
  return v_msg;
end $$;

create or replace function public.send_emote(p_code text, p_token text, p_emote text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  v_at timestamptz := now();
begin
  select * into l from public.lobbies where code = upper(trim(p_code));
  if not found then
    raise exception 'Cette table n''existe pas.' using hint = 'not_found';
  end if;
  me := private.require_player(l.id, p_token);
  if p_emote is null or not (p_emote = any (array['👏', '😂', '😱', '🔥', '🌶️', '🤡', '😭', '💩', '🫡', '🎉', '😎', '🙏'])) then
    raise exception 'Emote inconnue.';
  end if;
  if me.emote_at > v_at - interval '1 second' then
    return jsonb_build_object('ok', false);
  end if;
  update public.players set emote = p_emote, emote_at = v_at where id = me.id;
  perform private.broadcast(l.id, 'emote',
    jsonb_build_object('p', me.id, 'e', p_emote, 'at', private.epoch_ms(v_at)));
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.claim_timeout(text, text) to anon, authenticated;
grant execute on function public.set_turn_limit(text, text, integer) to anon, authenticated;
grant execute on function public.ping(text, text, boolean) to anon, authenticated;
grant execute on function public.save_push(text, text, text, text, text) to anon, authenticated;
grant execute on function public.push_public_key() to anon, authenticated;
grant execute on function public.get_messages(text, text, bigint) to anon, authenticated;
grant execute on function public.send_message(text, text, text) to anon, authenticated;
grant execute on function public.send_emote(text, text, text) to anon, authenticated;
