-- Règles de la maison ajoutées :
-- * la Dame de cœur commence la première manche (au lieu d'un tirage au sort) ;
-- * carte ou rien : en simples, après deux cartes de même valeur, le suivant
--   doit jouer cette valeur ou passer.

create or replace function private.rank_label(r integer)
returns text language sql immutable set search_path = '' as $$
  select case substr('3456789TJQKA2', r, 1)
    when 'T' then '10' when 'J' then 'Valet' when 'Q' then 'Dame'
    when 'K' then 'Roi' when 'A' then 'As' else substr('3456789TJQKA2', r, 1) end
$$;

create or replace function public.play_cards(p_code text, p_token text, p_cards text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lobbies;
  me public.players;
  g public.games;
  k integer := coalesce(cardinality(p_cards), 0);
  r integer;
  v_same integer;
  v_reason text;
  v_last integer[];
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
  -- Carte ou rien : en simples, si les deux dernières cartes posées ont la même
  -- valeur, on ne peut suivre qu'avec cette valeur (ou passer).
  if g.trick_size = 1 then
    select array_agg(private.card_rank(pl -> 'c' ->> 0) order by ord desc) into v_last
    from jsonb_array_elements(g.trick) with ordinality t(pl, ord)
    where pl ? 'c';
    if cardinality(v_last) >= 2 and v_last[1] = v_last[2] and r <> v_last[1] then
      raise exception '% ou rien : jouez cette valeur ou passez.', private.rank_label(v_last[1]);
    end if;
  end if;
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

  -- Le Trou-du-cul commence ; à la première manche, celui qui a la Dame de cœur.
  g.turn := coalesce(v_trou, (select key::uuid from jsonb_each(g.hands) where value ? 'QH'));
  g := private.push_event(g, jsonb_build_object(
    'type', 'round_start', 'player', g.turn,
    'reason', case when v_trou is not null then 'trou' else 'queen' end));

  insert into public.games select g.*;
  update public.lobbies
  set status = g.phase, round_no = g.round_no, notice = null
  where id = l.id;
  perform private.touch(l.id);
  return public.get_state(l.code, p_token);
end $$;
