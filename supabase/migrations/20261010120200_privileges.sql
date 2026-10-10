-- El Presidente : droits explicites (défense en profondeur ; RLS bloque déjà l'accès aux lignes).

revoke all on public.lobbies, public.players, public.games from anon, authenticated;
revoke all on all functions in schema private from public;

revoke all on function public.get_state(text, text) from public;
revoke all on function public.create_lobby(text, text) from public;
revoke all on function public.join_lobby(text, text, text) from public;
revoke all on function public.start_round(text, text) from public;
revoke all on function public.give_cards(text, text, text[]) from public;
revoke all on function public.play_cards(text, text, text[]) from public;
revoke all on function public.pass_turn(text, text) from public;
revoke all on function public.leave_lobby(text, text) from public;
revoke all on function public.kick_player(text, text, uuid) from public;
revoke all on function public.cancel_round(text, text) from public;

grant execute on function public.get_state(text, text) to anon, authenticated;
grant execute on function public.create_lobby(text, text) to anon, authenticated;
grant execute on function public.join_lobby(text, text, text) to anon, authenticated;
grant execute on function public.start_round(text, text) to anon, authenticated;
grant execute on function public.give_cards(text, text, text[]) to anon, authenticated;
grant execute on function public.play_cards(text, text, text[]) to anon, authenticated;
grant execute on function public.pass_turn(text, text) to anon, authenticated;
grant execute on function public.leave_lobby(text, text) to anon, authenticated;
grant execute on function public.kick_player(text, text, uuid) to anon, authenticated;
grant execute on function public.cancel_round(text, text) to anon, authenticated;
