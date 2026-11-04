# HAProxy, Caddy, nginx ou Pingora devant l'API

> Mesures faites avec l'API sur Postgres (commit `688873b`). Depuis, la base est SQLite :
> `compose.yml` et `run.ts` (service `pg`, `migrate`, `TRUNCATE`) sont à adapter avant de
> relancer le banc. La comparaison des proxys, elle, ne dépend pas de la base.

## Méthode

- **Serveur testé** : vrai CX23 Hetzner (hel1-dc2), 2 vCPU AMD EPYC-Rome partagés, 3,8 Go,
  Ubuntu 26.04. Proxy, API (binaire Bun) et Postgres 18.6 sur la même machine, comme en
  production : chaque cycle pris par le proxy l'est au jeu.
- **Générateur** : CCX23 séparé (4 vCPU dédiés) dans le même centre, réseau privé Hetzner
  (RTT moyen 0,67 ms). `infra/bench/bots.ts` : vraies parties sur le vrai protocole binaire,
  modèle ouvert (pas de _coordinated omission_), générateurs fusionnés par `merge.ts`.
- **Proxys** : HAProxy 3.4.7 (LTS), Caddy 2.11.7, nginx 1.30.6, mêmes réglages (TLS 1.3,
  certificat ECDSA P-256, 2 threads/workers, pas de journal d'accès, API par socket Unix).
  Référence : API en TCP direct, sans TLS.
- CPU et mémoire par conteneur lus dans les cgroups (`sample.sh`), vol de CPU (`steal`) suivi.
- Lancement : `bun run run.ts` (voir l'en-tête de `run.ts`).

## Résultats — essai court, 04/11/2026

Une seule mesure de 10 s par configuration (`results/quick5.jsonl`) : **indicatif**, et
avant l'alignement des réglages (voir « Campagne complète » plus bas).

100 tables × 4 joueurs (400 WebSockets), un coup toutes les 300 ms par table, 0 erreur,
0 % de vol de CPU :

| Proxy         | Coups/s | p50     | p99     | p99,9   | CPU du serveur | CPU du proxy / coup |
| ------------- | ------- | ------- | ------- | ------- | -------------- | ------------------- |
| aucun (TCP)   | 1 208   | 1,46 ms | 3,98 ms | 6,79 ms | 46 %           | —                   |
| HAProxy 3.4.7 | 1 177   | 1,59 ms | 4,18 ms | 6,57 ms | 53 %           | 0,172 ms            |
| Caddy 2.11.7  | 1 144   | 1,68 ms | 4,67 ms | 7,94 ms | 63 %           | 0,104 ms            |
| nginx 1.30.6  | 1 198   | 1,65 ms | 4,97 ms | 7,80 ms | 54 %           | 0,160 ms            |

Tempête de reconnexions (400 nouvelles connexions TLS en 2 s), p99 : HAProxy 12,1 ms,
Caddy 10,9 ms, nginx 9,1 ms, sans proxy 4,3 ms ; aucune erreur.

## Pingora — essai court, 04/11/2026

Proxy minimal écrit sur Pingora (`pingora/`, ~60 lignes de Rust : TLS 1.3 OpenSSL, h2,
socket Unix, X-Real-IP, 2 threads). **Pingora 0.9.1**, exception à la règle des 7 jours :
0.9.0 panique avec Tokio ≥ 1.54 (BufStream de capacité nulle, tokio#8494), corrigé en 0.9.1.

Nouvelle série, les cinq configurations dans les mêmes conditions (`results/quick7.jsonl`),
même charge que ci-dessus, 0 erreur, 0 % de vol de CPU :

| Proxy         | Coups/s | p50     | p99     | p99,9   | CPU du serveur | CPU du proxy / coup | Tempête p99 |
| ------------- | ------- | ------- | ------- | ------- | -------------- | ------------------- | ----------- |
| aucun (TCP)   | 1 195   | 1,45 ms | 3,95 ms | 8,83 ms | 48 %           | —                   | 4,6 ms      |
| HAProxy 3.4.7 | 1 194   | 1,54 ms | 4,25 ms | 6,76 ms | 54 %           | 0,187 ms            | 15,3 ms     |
| Caddy 2.11.7  | 1 191   | 1,64 ms | 4,63 ms | 7,89 ms | 55 %           | 0,205 ms            | 20,2 ms     |
| nginx 1.30.6  | 1 191   | 1,63 ms | 4,86 ms | 7,99 ms | 53 %           | 0,142 ms            | 10,3 ms     |
| Pingora 0.9.1 | 1 165   | 1,65 ms | 6,00 ms | 9,58 ms | 53 %           | 0,180 ms            | 9,6 ms      |

**Lecture** : d'une série à l'autre, les écarts entre proxys changent de sens (Caddy :
0,104 puis 0,205 ms de CPU par coup, tempête p99 10,9 puis 20,2 ms ; l'écart de CPU total
noté plus haut a disparu). À cette charge, **les quatre proxys sont dans le bruit de
mesure** ; Pingora n'apporte pas de gain visible, et demande du code Rust à maintenir.
Seule une campagne complète (répétitions, 10 000 connexions, saturation) départagerait
des écarts aussi faibles.

## Campagne complète, 04/11/2026

`results/campaign.jsonl` (brut), `results/campaign.md` (synthèse complète). Médianes de
3 répétitions de 60 s (20 s ignorées au début), ordre des proxys tiré au hasard à chaque
répétition, 165 mesures, 0 erreur, 0 % de vol de CPU.

### Ce qui a changé depuis les essais courts

- **Réglages alignés** (les essais courts ne comparaient pas exactement la même chose) :
  - Keep-alive vers l'API pour tous : HAProxy était en `http-server-close`.
  - Échange de clés X25519 puis P-256 : Caddy et Pingora proposaient d'abord
    X25519MLKEM768, plus coûteux.
  - Ordre des suites imposé par le serveur, AES-128-GCM en tête : nginx et Pingora
    suivaient le client et négociaient AES-256.
  - Pas de mise en mémoire tampon : nginx relaie au fil de l'eau (`proxy_buffering off`).
  - `http-no-delay` pour HAProxy.
  - Vérification avant chaque campagne (`openssl s_client`, `ss -x`) : TLS_AES_128_GCM_SHA256
    avec X25519 partout, une seule connexion vers l'API après 50 requêtes.
  - Écart restant : Caddy et Pingora n'ouvrent qu'un écouteur, nginx et HAProxy un par
    thread (`reuseport` / `shards by-thread`).
- **Nouveaux serveurs** créés par Pulumi (`pulumi/`, IPv6 seulement, détruits après) :
  - SUT : CX23 sur un hôte Intel Skylake, plus lent que l'EPYC-Rome des essais courts.
  - RTT : 0,82 ms en moyenne.
- **Charge régulière à travail constant** : environ 600 coups/s à chaque niveau, en
  allongeant le temps de réflexion avec le nombre de tables. Seul le nombre de WebSockets
  ouvertes change, de 400 à 10 000. La mesure commence une fois toutes les tables prêtes
  (`bots.ts`).
- **Saturation** sur 100 × 4 (400 WebSockets) : temps de réflexion de 200 à 50 ms.

### Charge régulière (~600 coups/s)

p99 / CPU du proxy par coup / mémoire du proxy :

| WebSockets | aucun (TCP) | HAProxy                | nginx                  | Caddy                    | Pingora                  |
| ---------- | ----------- | ---------------------- | ---------------------- | ------------------------ | ------------------------ |
| 400        | 4,6 ms      | 6,2 ms · 0,43 · 45 Mo  | 5,8 ms · 0,36 · 62 Mo  | 5,9 ms · 0,47 · 85 Mo    | 6,1 ms · 0,50 · 64 Mo    |
| 2 000      | 4,4 ms      | 5,9 ms · 0,43 · 118 Mo | 5,7 ms · 0,37 · 178 Mo | 6,1 ms · 0,45 · 317 Mo   | 6,6 ms · 0,55 · 292 Mo   |
| 4 000      | 4,0 ms      | 5,3 ms · 0,45 · 212 Mo | 5,5 ms · 0,39 · 321 Mo | 5,9 ms · 0,46 · 617 Mo   | 6,5 ms · 0,54 · 577 Mo   |
| 10 000     | 4,1 ms      | 5,6 ms · 0,49 · 425 Mo | 5,2 ms · 0,42 · 707 Mo | 6,2 ms · 0,47 · 1 457 Mo | 5,3 ms · 0,55 · 1 272 Mo |

- **Coût du proxy**, quel qu'il soit :
  - +1 à 2,5 ms au p99.
  - 10 à 15 points de CPU du serveur en plus (45 à 55 % au lieu de 32 à 41 %).
- **Entre proxys** :
  - Au p99, au plus ~1 ms d'écart.
  - Au CPU par coup, nginx est le plus sobre (0,36 à 0,42 ms), Pingora le plus coûteux
    (0,50 à 0,55 ms).
- **Mémoire, le vrai écart** : à 10 000 WebSockets, Caddy prend 1,46 Go (~145 Ko par
  connexion), Pingora 1,27 Go, nginx 0,71 Go et HAProxy 0,43 Go. C'est beaucoup sur 4 Go
  de RAM, partagés avec l'API.
- **Variabilité** : Caddy a le p99 le plus instable à forte connexion (31 % puis 46 %
  d'écart entre répétitions, sans doute le ramasse-miettes de Go).

### Saturation (400 WebSockets, réflexion de 200 à 50 ms)

| Réflexion | aucun (TCP)       | HAProxy           | nginx             | Caddy             | Pingora           |
| --------- | ----------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| 200 ms    | 1 779/s · 7,2 ms  | 1 779/s · 10,4 ms | 1 778/s · 9,5 ms  | 1 767/s · 11,4 ms | 1 768/s · 13,9 ms |
| 150 ms    | 2 312/s · 9,8 ms  | 2 219/s · 17,4 ms | 2 229/s · 16,6 ms | 2 133/s · 22,6 ms | 2 155/s · 26,0 ms |
| 100 ms    | 2 575/s · 27,4 ms | 2 440/s · 33,6 ms | 2 499/s · 30,9 ms | 2 385/s · 30,9 ms | 2 422/s · 39,6 ms |
| 50 ms     | 2 981/s · 13,1 ms | 2 838/s · 26,6 ms | 2 734/s · 21,2 ms | 2 648/s · 24,3 ms | 2 624/s · 32,4 ms |

(coups/s · p99)

- **Plafond** : vers 2 650 à 2 850 coups/s avec proxy, contre ~3 000 sans proxy. Le CPU
  du serveur est alors à 88–93 % avec proxy, 74 % sans.
- **Ordre** : HAProxy et nginx en tête, Caddy et Pingora 4 à 7 % derrière. Pingora a
  toujours le p50 le plus haut.
- **Mise à l'échelle** : au rythme réel du jeu, chaque niveau de charge régulière
  représente environ 600 coups/s. Le plafond en est 4 à 5 fois au-dessus.

### Tempête de reconnexions (nouvelles connexions TLS réparties sur 2 s)

- **2 000 connexions** :
  - Tous les proxys : p99 de 92 à 110 ms (HAProxy 92 ms, nginx 106 ms, Caddy 110 ms,
    Pingora 110 ms).
  - Sans TLS : 11 ms.
- **10 000 connexions** :
  - Le serveur ne suit pas : les poignées de main TLS sont limitées par le CPU.
  - Les dernières attendent 5,5 à 6,2 s pour tous les proxys (nginx 5,5 s, Caddy 5,5 s,
    Pingora 5,9 s, HAProxy 6,2 s), 2,1 s sans TLS.
  - Aucune erreur.

### Incident

Une mesure sur 165 a échoué (10 000 WebSockets · Pingora · répétition 3). Un générateur
a rendu un rapport vide (`JSON Parse error: Unexpected EOF` dans `merge.ts`). Les 4 niveaux
de Pingora relancés une fois aussitôt n'ont donné aucune erreur (`results/rerun-pingora.jsonl`,
p99 6,5 à 7,4 ms). La ligne 10 000 de Pingora repose donc sur 2 mesures.

### Lecture

- Le coût en latence du proxy (~1,5 ms au p99) et en CPU (~0,4 ms par coup) est le même
  pour les quatre, à ~20 % près. Au rythme du jeu, ce n'est pas lui qui limite.
- Ce qui les distingue :
  - **la mémoire par connexion** : HAProxy < nginx < Pingora < Caddy, rapport de 1 à 3,4 ;
  - **le plafond à saturation**, où HAProxy et nginx gardent 4 à 7 % d'avance.
- Pour Caddy, la mémoire ne compte qu'à des milliers de joueurs connectés en même temps,
  très au-delà du trafic attendu. À 400 connexions, c'est 85 Mo.

## Décision

**Caddy.** L'écart avec HAProxy est de l'ordre d'une fraction de milliseconde au p99 à cette
charge, négligeable pour le jeu, et Caddy supprime tout le code de certificats (acme.sh,
certificat provisoire, empreinte ACME, renouvellement). Si un jour il faut plus, la piste
envisagée est Pingora plutôt qu'un retour à HAProxy.

L'essai avec Pingora ne change pas la décision : aucun gain mesurable à notre charge.

La campagne complète ne la change pas non plus : pas d'écart de latence utile au jeu.
Elle nuance la piste Pingora : un proxy Pingora minimal n'a fait mieux que Caddy nulle
part, et c'est HAProxy ou nginx qui gagnent en mémoire et à saturation. À surveiller avec
Caddy : sa mémoire si le nombre de connexions simultanées dépasse quelques milliers.
