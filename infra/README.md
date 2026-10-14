# Infrastructure

```
Navigateur ──HTTPS──▶ Vercel (Next, arn1)
    └──HTTPS / WSS──▶ CX23 n°1 : HAProxy (TLS) ─socket─▶ API (Bun) ─socket─▶ Postgres 17 (primaire)
                                                                        │ réplication asynchrone (SSL, réseau privé)
                      CX23 n°2 : Postgres 17 (hot standby) + sauvegardes quotidiennes ◀┘
```

| Fichier                    | Rôle                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `api.Dockerfile`           | Image de l'API : un binaire Bun compilé (`presidente-api`, et `presidente-api migrate`), distroless, non root |
| `primary/compose.yml`      | HAProxy + API + Postgres primaire, réseau hôte, sockets Unix partagées (groupe 999)                           |
| `primary/haproxy.cfg`      | TLS 1.3, HTTP/2, WebSocket en tunnel, défi ACME sans état, `/metrics` bloqué                                  |
| `primary/postgresql.conf`  | Réglages pour 4 Go partagés (1 Go de buffers, JIT désactivé, WAL zstd, SSL)                                   |
| `primary/init/01-roles.sh` | Premier démarrage : rôles `app` et `replicator`, `pg_stat_statements`, slot du standby                        |
| `primary/acme/issue.sh`    | Certificat ECDSA Let's Encrypt (acme.sh), rechargement à chaud dans HAProxy                                   |
| `primary/deploy.sh`        | Déploiement : image, migrations, redémarrage, vérification de santé                                           |
| `standby/`                 | Hot standby (`init-standby.sh` : `pg_basebackup` par le slot)                                                 |
| `backup/`                  | `pg_dump` quotidien sur le standby, vérifié, rotation 7 jours (timer systemd)                                 |
| `system/`                  | `bootstrap.sh` (Docker, SSH par clé, mises à jour auto, THP) et `sysctl` (BBR, fq, backlog…)                  |
| `bench/`                   | Banc de charge : bots Bun qui jouent de vraies parties ([résultats](bench/RESULTS.md))                        |

## Mise en place (une fois)

1. **Hetzner**
   - Réseau privé `10.0.0.0/16` : n°1 = `10.0.0.2`, n°2 = `10.0.0.3`.
   - Pare-feu Hetzner : n°1 → 22 (votre IP), 80, 443 ; n°2 → 22 (votre IP) seulement.
     Postgres n'a **aucun** port public (le standby passe par le réseau privé).
2. **DNS** (zone `chegdali.fr`) : `el-presidente` → CNAME Vercel ; `api.el-presidente` → A/AAAA de n°1.
3. **Sur chaque serveur** (root) : cloner le dépôt dans `/srv/presidente/app`, puis
   `ROLE=primary ./infra/system/bootstrap.sh` (ou `ROLE=standby`). Ajouter la clé SSH de
   déploiement dans `/home/deploy/.ssh/authorized_keys`.
4. **Secrets** (n°1) dans `/etc/presidente/` (mode 600) : `pg_superuser`, `pg_app`,
   `pg_replicator`, et `api.env` (modèle : `primary/api.env.example`). Copier `pg_replicator`
   sur n°2.
5. **Certificat Postgres** (réplication en SSL) : `infra/primary/certs/postgres/server.{crt,key}`
   (auto-signé suffit, propriétaire 999, clé en 600), copié à l'identique sur n°2.
6. **Primaire** : `docker compose up -d postgres`, puis `primary/acme/issue.sh` (placer
   `ACME_THUMBPRINT` dans l'environnement), puis `deploy.sh` (migrations + API) et
   `docker compose up -d haproxy`.
7. **Standby** : `PRIMARY_IP=10.0.0.2 standby/init-standby.sh`, `docker compose up -d`,
   puis `backup/install.sh`.
8. **Google OAuth** : redirection autorisée
   `https://api.el-presidente.chegdali.fr/api/auth/callback/google`.
9. **Vercel** : projet sur `apps/web` (voir `apps/web/vercel.json`, région `arn1`),
   variable `NEXT_PUBLIC_API_URL=https://api.el-presidente.chegdali.fr`, domaine
   `el-presidente.chegdali.fr`.
10. **GitHub** : environnement `production` avec `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
    `DEPLOY_KNOWN_HOSTS` ; le workflow « Déploiement de l'API » publie l'image sur GHCR
    puis lance `deploy.sh`.

## Exploitation

- **Déployer l'API** : workflow « Déploiement de l'API ». Les parties en cours survivent au
  redémarrage (écriture des manches en attente à l'arrêt, rechargement au démarrage, échéances
  de passe automatique restaurées) ; les clients se reconnectent seuls.
- **Métriques** : `curl -H "Authorization: Bearer $METRICS_TOKEN" --unix-socket
  /srv/presidente/run/presidente/api.sock http://api.local/metrics` (jamais exposé par HAProxy).
- **Requêtes lentes** : `pg_stat_statements` et journal (`log_min_duration_statement = 200ms`).
- **Restaurer une sauvegarde** (testé) : `pg_restore -d <base vide> presidente-<date>.dump`.
- **Bascule (perte du primaire)** : sur n°2, `docker compose exec -u postgres postgres
  pg_ctl promote`, puis faire pointer `api.el-presidente` vers n°2 et y lancer la pile
  `primary/` en réutilisant les données promues. Manuel et documenté : pas de bascule
  automatique (risque de double primaire sur deux machines seulement).

## Validé dans ce dépôt (en conteneurs)

- Image de l'API construite ; `presidente-api migrate` appliqué par socket Unix.
- HAProxy (`haproxy -c`) puis en fonctionnement : TLS 1.3 seulement (TLS 1.2 refusé), HTTP/2,
  défi ACME, `/metrics` bloqué, contrôle de santé, WebSocket jusqu'à l'API par socket Unix.
- `postgresql.conf` chargé par Postgres 17 (réglages effectifs vérifiés).
- Réplication : premier démarrage (rôles, slot), `pg_basebackup` en SSL, écriture sur le
  primaire lue sur le standby, `pg_stat_replication` en `streaming/async`.
- Sauvegarde `pg_dump` sur le standby, relue (`pg_restore --list`) et restaurée.

Non validé ici (pas d'accès aux serveurs) : `bootstrap.sh` sur Ubuntu 24.04, émission réelle
du certificat Let's Encrypt, réseau et pare-feu Hetzner, déploiement Vercel.
