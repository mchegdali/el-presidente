# Infrastructure

```
Navigateur ──HTTPS──▶ Vercel (Next, arn1)
    └──HTTPS / WSS──▶ Hetzner CX23
                        Caddy      (réseau de l'hôte, 80/443 TCP + 443 UDP, TLS automatique)
                          └─socket Unix /run/presidente/api.sock─▶ API (Bun, SQLite en WAL)
                        Litestream ── lit le WAL ── SFTP ──▶ Storage Box Hetzner
                        /data      volume Hetzner : base (db/) et certificats (caddy/)
```

Tout est décrit en TypeScript avec Pulumi (`runtime: bun`) : serveur, volume, pare-feu,
Storage Box, conteneurs, DNS (OVH), domaine et variable du projet Vercel. Aucune étape à la
main sur le serveur, aucun fichier de secrets sur le serveur.

| Fichier                       | Rôle                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `index.ts`, `Pulumi.*.yaml`   | Pile `prod` ; secrets dans l'environnement ESC `el-presidente/prod`                                           |
| `src/server.ts`               | Serveur (Ubuntu LTS), pare-feu (22, 80, 443), volume protégé, clé d'hôte SSH épinglée                         |
| `src/cloud-init.ts`           | Utilisateurs `admin` et `deploy`, sshd par clé seulement, Docker, sysctl, mises à jour                        |
| `src/backup.ts`               | Storage Box et sous-compte Litestream (mot de passe généré par Pulumi)                                        |
| `src/app.ts`                  | Conteneurs par l'API Docker à travers SSH : restauration → API → Litestream → Caddy                           |
| `src/dns.ts`, `src/vercel.ts` | Enregistrements OVH (A, AAAA, CAA, CNAME) ; `NEXT_PUBLIC_API_URL` et domaine Vercel                           |
| `images/`                     | Images API, Caddy et Litestream : distroless, non root, épinglées par empreinte                               |
| `bench/`                      | Banc de charge ([résultats](bench/RESULTS.md)) et comparaison des proxys ([proxys](bench/proxies/PROXIES.md)) |

## Sécurité

- **SSH** ouvert à Internet, par clé seulement, root interdit. `admin` (clé
  `desktop-windows`, sudo) pour l'humain ; `deploy` (clés `el-presidente-ci` et
  `desktop-windows`) limité par `command="docker system dial-stdio"` : l'API Docker, sans
  shell. La clé d'hôte du serveur est générée par Pulumi et épinglée (pas de « trust on
  first use »).
- **Conteneurs** : système de fichiers en lecture seule, aucune capacité,
  `no-new-privileges`, utilisateurs non root (API et Litestream 65532, Caddy 65533, groupe
  10000 partagé pour la socket), limites mémoire. Docker : `icc` désactivé, pas de proxy
  utilisateur, `live-restore`.
- **Secrets** : venus de l'extérieur dans ESC (Hetzner, OVH, Vercel, Google, VAPID, clé de
  la CI) ; générés par Pulumi (`BETTER_AUTH_SECRET`, `METRICS_TOKEN`, mot de passe de la
  Storage Box, clé d'hôte), chiffrés dans l'état. Ils ne vivent que dans l'environnement des
  conteneurs. Trois règles en découlent :
  1. pas de sauvegarde ni d'instantané Hetzner du serveur (jetable ; les données sont sur
     le volume et dans la Storage Box) ;
  2. aucun secret journalisé (environnement lu une fois par Zod, journal sans environnement) ;
  3. l'API ne lance aucun processus enfant.
- Le service de métadonnées Hetzner (qui contient la clé d'hôte SSH) n'est accessible qu'à root.

## Données

- SQLite en WAL, `synchronous = NORMAL` : un arrêt de l'API ne perd rien ; une coupure de
  courant peut perdre les toutes dernières transactions, jamais corrompre la base.
- Litestream envoie le WAL chaque seconde, un instantané par jour, gardé 7 jours.
- **Remplacement du serveur** (changement de cloud-init) : le volume est détaché puis
  rattaché, rien à restaurer.
- **Sinistre** (volume perdu) : au déploiement suivant, le conteneur de restauration
  reconstruit la base depuis la Storage Box avant le démarrage de l'API. Exercé le
  2026-11-04 : serveur et volume remplacés, ligne témoin retrouvée, `integrity_check` ok.
- Le volume et la Storage Box sont protégés deux fois (Pulumi `protect` et protection
  Hetzner) : les supprimer demande de lever les deux, volontairement.

## Mise en place (une fois)

1. **Environnement ESC `el-presidente/prod`** :

   ```yaml
   values:
     pulumiConfig:
       hcloud:token: { fn::secret: … }
       ovh:endpoint: ovh-eu
       ovh:applicationKey: …
       ovh:applicationSecret: { fn::secret: … }
       ovh:consumerKey: { fn::secret: … } # droits limités à /domain/zone/chegdali.fr/*
       vercel:apiToken: { fn::secret: … }
       el-presidente:googleClientId: { fn::secret: … }
       el-presidente:googleClientSecret: { fn::secret: … }
       el-presidente:vapidPublicKey: …
       el-presidente:vapidPrivateKey: { fn::secret: … }
     environmentVariables:
       CI_SSH_KEY: { fn::secret: … } # clé privée de `el-presidente-ci`
   ```

2. **Pulumi Cloud** : politique OIDC de GitHub (type de jeton **Personal**, utilisateur `chegdalim` ; les jetons d'organisation sont réservés à Enterprise), limitée au sujet
   `repo:mchegdali@82240410/el-presidente@1413107630:environment:production` (sujet immuable de
   GitHub : identifiants numériques du compte et du dépôt) ; environnement GitHub `production`
   limité à la branche `main`.
3. **Google OAuth** : client « Application Web », redirection autorisée
   `https://api.el-presidente.chegdali.fr/api/auth/callback/google`.
4. **`Pulumi.prod.yaml`** : `acmeEmail` facultatif (contact Let's Encrypt et VAPID).
5. **Jeton GHCR du poste** : la CI publie les images avec son `GITHUB_TOKEN`, mais le
   premier déploiement part d'un poste, avant toute fusion dans `main`. Jeton GitHub
   classique (`write:packages`, expiration courte), dans un environnement ESC à part, que
   la pile n'importe pas (la CI garde son propre jeton) :

   ```yaml
   # environnement ESC el-presidente/ghcr
   values:
     environmentVariables:
       GHCR_TOKEN: { fn::secret: ghp_… }
   ```

6. **Premier déploiement**, depuis le poste (images construites et publiées par empreinte,
   puis `pulumi up` avec `GHCR_TOKEN` dans l'environnement) :

   ```sh
   cd infra
   pulumi env run mchegdali/el-presidente/ghcr -- pulumi up --stack prod   # tout, sauf Litestream (avertissement : pas encore de réplication)
   ssh-keyscan -p 23 -t ecdsa <serveur de la Storage Box>   # empreinte publiée par Hetzner : SHA256:oDHZqKXnoMtgvPBjjC57pcuFez28roaEuFcfwyg8O5c
   pulumi config set --stack prod storageBoxHostKey "ecdsa-sha2-nistp521 AAAA…"
   pulumi env run mchegdali/el-presidente/ghcr -- pulumi up --stack prod   # ajoute la restauration (sans effet : la base existe) et Litestream
   ```

   Le serveur de la Storage Box est dans la console Hetzner (sous-compte `litestream`).

   Ensuite, chaque push sur `main` déploie (`.github/workflows/deploy.yml`).

## Exploitation

```sh
ssh admin@api.el-presidente.chegdali.fr
sudo docker ps
sudo docker logs presidente-api
sudo docker exec presidente-litestream /usr/local/bin/litestream databases
```

Si un `pulumi up` s'interrompt pendant un remplacement du serveur, l'état peut croire des
conteneurs présents qui n'existent pas sur le nouveau serveur : `pulumi refresh` (aperçu,
puis application), puis `pulumi up`.
