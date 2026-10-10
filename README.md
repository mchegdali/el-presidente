# El Presidente

Le jeu de cartes **Président**, à la mexicaine, jouable à plusieurs en temps réel depuis
téléphones et ordinateurs. Pas de compte : on crée une table, on partage le lien, chacun
entre son nom et c'est parti.

- **Front** : Next.js (App Router) déployé sur Vercel.
- **Back** : Supabase (Postgres + Realtime). Toute la logique de jeu est dans la base.

## Règles de la casa

- 52 cartes, 3 à 8 joueurs. Ordre : 3 < 4 < … < R < A < **2**.
- Le premier joueur d'un pli choisit le format (simple, paire, brelan, carré) ; tout le pli
  garde ce format. On suit avec une valeur **égale ou supérieure**, ou on passe (on peut
  revenir dans le même pli après avoir passé).
- Tout le monde passe : le dernier à avoir joué relance.
- **Le 2 ferme le pli.**
- **Coupe à 4** : dès que les 4 cartes d'une valeur sont sur le pli (7, 7, 7, 7 ou 7-7 puis
  7-7), le pli est coupé et celui qui a complété la série relance. Un carré en ouverture
  coupe aussitôt.
- Fin de manche : Président, Vice-Président, Neutres, Vice-Trou-du-cul, Trou-du-cul
  (pas de Vices à 3 joueurs).
- Manche suivante : le Trou-du-cul donne automatiquement ses 2 meilleures cartes au
  Président, qui lui en rend 2 de son choix ; idem avec 1 carte entre Vice-Trou-du-cul et
  Vice-Président. Le Trou-du-cul commence (tirage au sort à la 1re manche).

## Architecture

```
app/                 pages (accueil, table /t/[code], galerie /cartes)
components/          écrans (salon, partie, résultats) et cartes SVG
lib/                 client Supabase, synchronisation temps réel, helpers cartes
supabase/migrations/ schéma + logique de jeu en PL/pgSQL
tests/               tests de la logique de jeu (Postgres en mémoire via PGlite)
scripts/             backend local pour développer sans Supabase
```

- Les clients n'accèdent jamais directement aux tables (RLS sans policy). Ils appellent des
  fonctions RPC (`create_lobby`, `join_lobby`, `start_round`, `play_cards`, `pass_turn`,
  `give_cards`, …) qui valident chaque coup côté serveur et renvoient l'état vu par le
  joueur : **chacun ne reçoit que sa propre main**.
- Un joueur est identifié par un jeton aléatoire stocké dans son navigateur (seul son hash
  est en base) : il retrouve sa place après un rafraîchissement.
- À chaque changement, la base publie `{ version }` sur le canal Realtime `lobby:<id>`
  (`realtime.send`) ; les clients relisent alors leur état. Une relecture périodique sert
  de filet de sécurité.
- Les tables inactives depuis 2 jours sont supprimées à la création d'une nouvelle table.

## Développement

```bash
npm install
npm test                 # logique de jeu : règles + parties complètes de 3 à 8 joueurs

# Jouer en local sans Supabase (Postgres en mémoire, sans temps réel) :
npm run dev:backend      # http://localhost:54321
cp .env.example .env.local   # puis pointer NEXT_PUBLIC_SUPABASE_URL sur http://localhost:54321
npm run dev              # http://localhost:3000
```

Pour tester à plusieurs en local, ouvrez la table dans des fenêtres de navigation privée
différentes (chaque fenêtre a son propre jeton).

## Déploiement

1. **Supabase** : appliquer les fichiers de `supabase/migrations/` dans l'ordre (SQL Editor
   ou `supabase db push`).
2. **Vercel** : projet relié à ce dépôt, avec les variables d'environnement
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (voir
   `.env.example`). La branche `main` est déployée en production.

Free tier : un projet Supabase gratuit est mis en pause après une semaine sans activité ;
il se réactive depuis le tableau de bord Supabase.
