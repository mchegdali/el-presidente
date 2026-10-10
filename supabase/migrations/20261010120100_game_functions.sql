-- El Presidente : logique de jeu (helpers privés + API RPC).

-- ---------------------------------------------------------------------------
-- Helpers (schéma privé, non exposé par l'API)
-- ---------------------------------------------------------------------------

create function private.hash_token(p_token text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- 3 → 1, 4 → 2, …, A → 12, 2 → 13. 0 si invalide.
create function private.card_rank(c text)
returns integer language sql immutable set search_path = '' as $$
  select case when length(c) = 2 and strpos('SHDC', right(c, 1)) > 0
              then strpos('3456789TJQKA2', left(c, 1)) else 0 end
$$;

create function private.card_order(c text)
returns integer language sql immutable set search_path = '' as $$
  select private.card_rank(c) * 4 + strpos('CDHS', right(c, 1))
$$;

create function private.sorted_cards(cards text[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(c order by private.card_order(c)), '[]'::jsonb) from unnest(cards) c
$$;

create function private.hand_size(g public.games, p uuid)
returns integer language sql immutable set search_path = '' as $$
  select coalesce(jsonb_array_length(g.hands -> p::text), 0)
$$;

create function private.active_count(g public.games)
returns integer language sql immutable set search_path = '' as $$
  select count(*)::integer from unnest(g.seats) s where private.hand_size(g, s) > 0
$$;

-- Prochain joueur qui a encore des cartes, après p_from dans l'ordre de jeu.
create function private.next_active(g public.games, p_from uuid)
returns uuid language plpgsql immutable set search_path = '' as $$
declare
  n integer := cardinality(g.seats);
  start_idx integer := coalesce(array_position(g.seats, p_from), 0);
  candidate uuid;
begin
  for i in 1..n loop
    candidate := g.seats[((start_idx - 1 + i) % n) + 1];
    if private.hand_size(g, candidate) > 0 then
      return candidate;
    end if;
  end loop;
  return null;
end $$;

create function private.remove_cards(g public.games, p uuid, cards text[])
returns public.games language plpgsql immutable set search_path = '' as $$
begin
  g.hands := jsonb_set(g.hands, array[p::text], (
    select coalesce(jsonb_agg(c order by private.card_order(c)), '[]'::jsonb)
    from jsonb_array_elements_text(g.hands -> p::text) c
    where not (c = any (cards))));
  return g;
end $$;

create function private.add_cards(g public.games, p uuid, cards text[])
returns public.games language plpgsql immutable set search_path = '' as $$
begin
  g.hands := jsonb_set(g.hands, array[p::text], (
    select coalesce(jsonb_agg(c order by private.card_order(c)), '[]'::jsonb)
    from (
      select jsonb_array_elements_text(g.hands -> p::text) c
      union all
      select unnest(cards)
    ) x));
  return g;
end $$;

create function private.push_event(g public.games, ev jsonb)
returns public.games language plpgsql immutable set search_path = '' as $$
begin
  g.event_seq := g.event_seq + 1;
  g.events := (
    select coalesce(jsonb_agg(e order by (e ->> 'seq')::integer), '[]'::jsonb)
    from (
      select e
      from jsonb_array_elements(g.events || jsonb_build_array(ev || jsonb_build_object('seq', g.event_seq))) e
      order by (e ->> 'seq')::integer desc
      limit 20
    ) x);
  return g;
end $$;

-- Ferme le pli : le gagnant relance, ou le joueur suivant s'il n'a plus de cartes.
create function private.close_trick(g public.games, p_winner uuid)
returns public.games language plpgsql immutable set search_path = '' as $$
begin
  g.prev_trick := g.trick;
  g.prev_winner := p_winner;
  g.trick := '[]'::jsonb;
  g.trick_size := 0;
  g.trick_rank := 0;
  g.passes := 0;
  g.last_player := null;
  g.turn := case when private.hand_size(g, p_winner) > 0 then p_winner
                 else private.next_active(g, p_winner) end;
  return g;
end $$;

-- Fin de manche : le dernier joueur avec des cartes est Trou-du-cul, on attribue les rôles.
create function private.finish_round(g public.games)
returns public.games language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  g.finished := g.finished || array(
    select s from unnest(g.seats) with ordinality t(s, i)
    where private.hand_size(g, s) > 0 and not (s = any (g.finished))
    order by i);
  n := cardinality(g.finished);
  g.phase := 'over';
  g.turn := null;
  if jsonb_array_length(g.trick) > 0 then
    g.prev_trick := g.trick;
    g.prev_winner := g.last_player;
  end if;
  g.trick := '[]'::jsonb;
  g.trick_size := 0;
  g.trick_rank := 0;
  g.passes := 0;
  g.last_player := null;

  update public.players p
  set role = case
    when f.pos = 1 then 'president'
    when f.pos = n then 'trou'
    when n >= 4 and f.pos = 2 then 'vice_president'
    when n >= 4 and f.pos = n - 1 then 'vice_trou'
    else 'neutral'
  end
  from unnest(g.finished) with ordinality f(pid, pos)
  where p.id = f.pid;

  update public.lobbies set status = 'finished' where id = g.lobby_id;
  return private.push_event(g, jsonb_build_object('type', 'round_over'));
end $$;

create function private.save_game(g public.games)
returns void language sql set search_path = '' as $$
  update public.games set
    phase = g.phase, hands = g.hands, turn = g.turn, trick = g.trick,
    trick_size = g.trick_size, trick_rank = g.trick_rank, last_player = g.last_player,
    passes = g.passes, prev_trick = g.prev_trick, prev_winner = g.prev_winner,
    finished = g.finished, exchanges = g.exchanges, events = g.events, event_seq = g.event_seq
  where lobby_id = g.lobby_id
$$;

-- Incrémente la version et prévient les clients abonnés au canal de la table.
create function private.touch(p_lobby uuid)
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
end $$;

create function private.lock_lobby(p_code text)
returns public.lobbies language plpgsql set search_path = '' as $$
declare
  l public.lobbies;
begin
  select * into l from public.lobbies where code = upper(trim(p_code)) for update;
  if not found then
    raise exception 'Cette table n''existe pas (ou plus).' using hint = 'not_found';
  end if;
  return l;
end $$;

create function private.require_player(p_lobby uuid, p_token text)
returns public.players language plpgsql set search_path = '' as $$
declare
  me public.players;
begin
  select * into me from public.players
  where lobby_id = p_lobby and token_hash = private.hash_token(p_token);
  if not found then
    raise exception 'Vous ne faites pas partie de cette table.' using hint = 'not_member';
  end if;
  return me;
end $$;

create function private.clean_name(p_name text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if length(n) < 1 then
    raise exception 'Entrez votre nom.';
  end if;
  if length(n) > 20 then
    raise exception 'Nom trop long (20 caractères max).';
  end if;
  return n;
end $$;

create function private.check_token(p_token text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    raise exception 'Identifiant de navigateur invalide.';
  end if;
end $$;

-- Annule la manche en cours (départ ou exclusion d'un joueur, ou décision de l'hôte).
create function private.cancel_round(l public.lobbies, p_notice text)
returns void language plpgsql set search_path = '' as $$
begin
  if l.status in ('exchange', 'playing') then
    delete from public.games where lobby_id = l.id;
    update public.lobbies set status = 'waiting', notice = p_notice where id = l.id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- API publique (RPC)
-- ---------------------------------------------------------------------------

create function public.get_state(p_code text, p_token text)
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
    raise exception 'Cette table n''existe pas (ou plus).' using hint = 'not_found';
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
      'position', array_position(g.finished, p.id)
    ) order by p.seat), '[]'::jsonb)
  into v_players
  from public.players p where p.lobby_id = l.id;

  if g.lobby_id is not null then
    v_game := jsonb_build_object(
      'phase', g.phase,
      'round_no', g.round_no,
      'seats', to_jsonb(g.seats),
      'turn', g.turn,
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
      'notice', l.notice
    ),
    'me', me.id,
    'players', v_players,
    'game', v_game,
    'hand', case when me.id is not null then coalesce(g.hands -> me.id::text, '[]'::jsonb) end
  );
end $$;

create function public.create_lobby(p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.clean_name(p_name);
  v_code text;
  l public.lobbies;
  me public.players;
begin
  perform private.check_token(p_token);
  -- Ménage : les tables inactives depuis 2 jours disparaissent.
  delete from public.lobbies where updated_at < now() - interval '2 days';

  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::integer, 1), '')
    into v_code from generate_series(1, 5);
    exit when not exists (select 1 from public.lobbies where code = v_code);
  end loop;

  insert into public.lobbies (code) values (v_code) returning * into l;
  insert into public.players (lobby_id, name, token_hash, seat)
  values (l.id, v_name, private.hash_token(p_token), 1)
  returning * into me;
  update public.lobbies set host_id = me.id where id = l.id;
  return public.get_state(v_code, p_token);
end $$;

create function public.join_lobby(p_code text, p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := private.clean_name(p_name);
  l public.lobbies;
  v_id uuid;
begin
  perform private.check_token(p_token);
  l := private.lock_lobby(p_code);

  if exists (select 1 from public.players
             where lobby_id = l.id and token_hash = private.hash_token(p_token)) then
    return public.get_state(l.code, p_token);
  end if;
  if l.status in ('exchange', 'playing') then
    raise exception 'Une manche est en cours : vous pourrez rejoindre à la fin de celle-ci.';
  end if;
  if (select count(*) from public.players where lobby_id = l.id) >= 8 then
    raise exception 'La table est complète (8 joueurs maximum).';
  end if;
  if exists (select 1 from public.players where lobby_id = l.id and lower(name) = lower(v_name)) then
    raise exception 'Ce nom est déjà pris à cette table.';
  end if;

  insert into public.players (lobby_id, name, token_hash, seat)
  values (l.id, v_name, private.hash_token(p_token),
          coalesce((select max(seat) from public.players where lobby_id = l.id), 0) + 1)
  returning id into v_id;
  if l.host_id is null then
    update public.lobbies set host_id = v_id where id = l.id;
  end if;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.start_round(p_code text, p_token text)
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

  delete from public.games where lobby_id = l.id;
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
  g.trick := '[]'::jsonb;
  g.trick_size := 0;
  g.trick_rank := 0;
  g.passes := 0;
  g.prev_trick := '[]'::jsonb;
  g.finished := '{}';
  g.events := '[]'::jsonb;
  g.event_seq := 0;

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

  -- Le Trou-du-cul commence ; à la première manche, tirage au sort.
  g.turn := coalesce(v_trou, v_seats[1 + floor(random() * n)::integer]);
  g := private.push_event(g, jsonb_build_object('type', 'round_start', 'player', g.turn));

  insert into public.games select g.*;
  update public.lobbies
  set status = g.phase, round_no = g.round_no, notice = null
  where id = l.id;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.give_cards(p_code text, p_token text, p_cards text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  k integer := coalesce(cardinality(p_cards), 0);
  idx integer;
  e jsonb;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found or g.phase <> 'exchange' then
    raise exception 'Il n''y a pas d''échange en cours.';
  end if;

  for i in 0 .. jsonb_array_length(g.exchanges) - 1 loop
    if (g.exchanges -> i ->> 'from')::uuid = me.id and not (g.exchanges -> i ->> 'done')::boolean then
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
     or (select count(*) from jsonb_array_elements_text(g.hands -> me.id::text) c
         where c = any (p_cards)) <> k then
    raise exception 'Vous n''avez pas ces cartes.';
  end if;

  g := private.remove_cards(g, me.id, p_cards);
  g := private.add_cards(g, (e ->> 'to')::uuid, p_cards);
  g.exchanges := jsonb_set(g.exchanges, array[idx::text],
    e || jsonb_build_object('cards', private.sorted_cards(p_cards), 'done', true));

  if not exists (select 1 from jsonb_array_elements(g.exchanges) x where not (x ->> 'done')::boolean) then
    g.phase := 'playing';
    update public.lobbies set status = 'playing' where id = l.id;
    g := private.push_event(g, jsonb_build_object('type', 'exchange_done', 'player', g.turn));
  end if;

  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.play_cards(p_code text, p_token text, p_cards text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  k integer := coalesce(cardinality(p_cards), 0);
  r integer;
  v_same integer;
  v_reason text;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found or g.phase <> 'playing' then
    raise exception 'Aucune manche en cours.';
  end if;
  if g.turn is distinct from me.id then
    raise exception 'Ce n''est pas votre tour.';
  end if;
  if k < 1 or k > 4 then
    raise exception 'Choisissez entre 1 et 4 cartes.';
  end if;
  if (select count(distinct c) from unnest(p_cards) c) <> k
     or (select count(*) from jsonb_array_elements_text(g.hands -> me.id::text) c
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
    if r < g.trick_rank then
      raise exception 'Il faut jouer une valeur égale ou supérieure.';
    end if;
  end if;

  g := private.remove_cards(g, me.id, p_cards);
  g.trick := g.trick || jsonb_build_array(jsonb_build_object('p', me.id, 'c', private.sorted_cards(p_cards)));
  g.trick_size := k;
  g.trick_rank := r;
  g.last_player := me.id;
  g.passes := 0;

  if private.hand_size(g, me.id) = 0 then
    g.finished := g.finished || me.id;
    g := private.push_event(g, jsonb_build_object(
      'type', 'finished', 'player', me.id, 'position', cardinality(g.finished)));
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
    g := private.push_event(g, jsonb_build_object('type', v_reason, 'player', me.id));
  end if;

  if private.active_count(g) <= 1 then
    g := private.finish_round(g);
  elsif v_reason is not null then
    g := private.close_trick(g, me.id);
  else
    g.turn := private.next_active(g, me.id);
  end if;

  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.pass_turn(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  v_needed integer;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  select * into g from public.games where lobby_id = l.id for update;
  if not found or g.phase <> 'playing' then
    raise exception 'Aucune manche en cours.';
  end if;
  if g.turn is distinct from me.id then
    raise exception 'Ce n''est pas votre tour.';
  end if;
  if g.trick_size = 0 then
    raise exception 'Vous ouvrez le pli : vous devez jouer.';
  end if;

  g.trick := g.trick || jsonb_build_array(jsonb_build_object('p', me.id, 'pass', true));
  g.passes := g.passes + 1;
  -- Le pli est remporté quand tous les autres joueurs encore en jeu ont passé.
  v_needed := private.active_count(g)
    - case when private.hand_size(g, g.last_player) > 0 then 1 else 0 end;
  if g.passes >= v_needed then
    g := private.push_event(g, jsonb_build_object('type', 'won', 'player', g.last_player));
    g := private.close_trick(g, g.last_player);
  else
    g.turn := private.next_active(g, me.id);
  end if;

  perform private.save_game(g);
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.leave_lobby(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  perform private.cancel_round(l, me.name || ' a quitté la table : manche annulée.');
  delete from public.players where id = me.id;

  if not exists (select 1 from public.players where lobby_id = l.id) then
    delete from public.lobbies where id = l.id;
    return jsonb_build_object('left', true);
  end if;
  if l.host_id = me.id then
    update public.lobbies
    set host_id = (select id from public.players where lobby_id = l.id order by seat limit 1)
    where id = l.id;
  end if;
  perform private.touch(l.id);
  return jsonb_build_object('left', true);
end $$;

create function public.kick_player(p_code text, p_token text, p_player uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  v_name text;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  if l.host_id is distinct from me.id then
    raise exception 'Seul le créateur de la table peut retirer un joueur.';
  end if;
  if p_player = me.id then
    raise exception 'Utilisez « Quitter la table » pour partir.';
  end if;
  select name into v_name from public.players where id = p_player and lobby_id = l.id;
  if not found then
    raise exception 'Ce joueur n''est plus à la table.';
  end if;
  perform private.cancel_round(l, v_name || ' a été retiré de la table : manche annulée.');
  delete from public.players where id = p_player;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;

create function public.cancel_round(p_code text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
begin
  l := private.lock_lobby(p_code);
  me := private.require_player(l.id, p_token);
  if l.host_id is distinct from me.id then
    raise exception 'Seul le créateur de la table peut annuler la manche.';
  end if;
  perform private.cancel_round(l, 'Manche annulée par ' || me.name || '.');
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;
