-- Supabase uniquement (ignoré par les tests PGlite) : appels HTTP sortants vers
-- l'Edge Function `push` et tâche périodique de filet de sécurité (délais dépassés
-- quand plus aucun joueur n'a la page ouverte, notifications en attente).
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('presidente-sweep', '5 seconds', 'select private.sweep()');
