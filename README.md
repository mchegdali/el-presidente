# El Presidente

Le jeu de cartes **Président**, à la mexicaine, jouable à plusieurs en temps réel depuis
téléphones et ordinateurs. On se connecte avec Google, on crée une table, on partage le lien.

## Règles de la casa

- 52 cartes, 3 à 8 joueurs. Ordre : 3 < 4 < … < R < A < **2**.
- Le premier joueur d'un pli choisit le format (simple, paire, brelan, carré) ; tout le pli
  garde ce format. On suit avec une valeur **égale ou supérieure**, ou on passe (on peut
  revenir dans le même pli après avoir passé).
- **Carte ou rien** : en simples, quand deux cartes de même valeur se suivent (7 puis 7),
  le suivant doit jouer cette valeur ou passer. S'il passe, le joueur d'après n'est plus
  contraint.
- Tout le monde passe : le dernier à avoir joué relance.
- **Le 2 ferme le pli.**
- **Coupe à 4** : dès que les 4 cartes d'une valeur sont sur le pli (7, 7, 7, 7 ou 7-7 puis
  7-7), le pli est coupé et celui qui a complété la série relance. Un carré en ouverture
  coupe aussitôt.
- Fin de manche : Président, Vice-Président, Neutres, Vice-Trou-du-cul, Trou-du-cul
  (pas de Vices à 3 joueurs).
- Manche suivante : le Trou-du-cul donne automatiquement ses 2 meilleures cartes au
  Président, qui lui en rend 2 de son choix ; idem avec 1 carte entre Vice-Trou-du-cul et
  Vice-Président. Le Trou-du-cul commence ; à la 1re manche, c'est celui qui a la Dame de
  cœur.

## À la table

- **Ordre de jeu** : la bande au-dessus du tapis montre tous les joueurs, vous compris,
  dans l'ordre du tour ; 💤 signale un joueur dont la page est fermée ou en arrière-plan.
- **Chat** dans le salon et pendant la partie (bouton 💬), avec émoticônes et `@mentions`
  (autocomplétion ; la personne mentionnée est mise en évidence et son téléphone vibre).
- **Emotes rapides** : une bulle s'affiche quelques secondes au-dessus de votre nom.
- **Passe automatique** : l'hôte règle un délai par tour (15 s à 2 min) ou la désactive.
  Délai dépassé : le joueur passe ; s'il ouvre le pli, sa plus petite carte est jouée ;
  pendant l'échange, ses cartes les plus faibles sont données.
- **Notifications push** : « 🔔 Me prévenir quand c'est mon tour ». Si aucun de vos onglets
  n'est au premier plan quand vient votre tour (ou quand on vous @mentionne), vous recevez
  une notification sur vos appareils abonnés. Sur iPhone, il faut d'abord ajouter le site à
  l'écran d'accueil.
- Une table inexistante ou fermée renvoie à l'accueil avec le seul message « Cette table
  n'existe pas. ».

## Architecture

```
apps/web/        Next 16 (Vercel) : pages statiques, état de la table par WebSocket
apps/api/        Bun + Hono (Hetzner) : seul à parler à Postgres ; jeu, temps réel, auth
packages/game/   Règles du jeu (pures, partagées) et protocole WebSocket binaire
packages/db/     Schéma Drizzle et migrations (tables, contraintes, index : aucune fonction)
packages/config/ tsconfig commun
infra/           Image de l'API, HAProxy, Postgres primaire + standby, sauvegardes, banc de charge
```

- **Tranches verticales** des deux côtés : `apps/api/src/features/<domaine>/<cas d'usage>/`
  (route, cas d'usage, requêtes, tests), `apps/web/src/features/<domaine>/`.
- **Erreurs typées** côté API (`better-result`) : chaque cas d'usage renvoie un `Result`, une
  seule fonction traduit les erreurs en statuts HTTP ; le client `hc` du site est typé par
  les routes Hono (`AppType`), sans génération de code.
- **Temps réel** : une WebSocket par onglet, messages binaires (un coup tient en quelques
  octets), diffusion par le pub/sub natif de Bun. L'état des parties vit en mémoire dans
  l'API ; il est écrit en base par lots (toutes les ~10 ms) et rechargé au redémarrage.
  Le client avance son état avec les deltas reçus (même code que le serveur, parité testée).
- **Passe automatique** : une seule horloge côté serveur (tas binaire), qui joue même si plus
  personne n'a la page ouverte.
- **Sécurité** : comptes Google (better-auth), cookie `HttpOnly` partagé entre le site et
  l'API, origine vérifiée sur toute requête qui modifie l'état et à l'ouverture des
  WebSockets, entrées validées (Zod / décodeur binaire borné), limites de débit, CSP. Les
  messages du chat gardent leur auteur et son adresse (LCEN), et peuvent être signalés.

Déploiement et exploitation : [`infra/README.md`](infra/README.md).

## Développement

Prérequis : [Bun](https://bun.sh) 1.4, Docker (pour Postgres).

```bash
bun install
docker compose -f compose.dev.yml up -d          # Postgres 17 sur localhost:5432
cp apps/api/.env.example apps/api/.env           # ENABLE_TEST_LOGIN pour jouer sans Google
cp apps/web/.env.example apps/web/.env.local
bun run --cwd packages/db migrate
bun run dev                                      # API :4000 + site :3000
```

Sans identifiants Google, connectez-vous avec la route de test (développement uniquement) :
`curl -X POST localhost:4000/test/login -H 'origin: http://localhost:3000' -H
'content-type: application/json' -d '{"name":"Ana"}'` renvoie un cookie à poser dans le
navigateur (Playwright le fait dans `apps/web/e2e`).

```bash
bun run lint && bun run format:check && bun run typecheck
bun run test                                     # PGlite par défaut ; TEST_DATABASE_URL=… pour un vrai Postgres
bun run --cwd apps/web e2e                       # 3 navigateurs jouent une partie (API + site + Postgres)
bun run --cwd packages/game bench                # micro-banc du moteur
bun run --cwd infra/bench bots --api http://localhost:4000 --tables 10   # banc de charge (voir infra/bench)
```
