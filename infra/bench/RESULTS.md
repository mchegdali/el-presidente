# Résultats du banc de charge

## Méthode

`bun run bots.ts` : des bots jouent de vraies parties légales (règles de `@el-presidente/game`)
sur le vrai protocole binaire, à travers HAProxy en TLS jusqu'à l'API par socket Unix, avec
Postgres réel. Modèle ouvert : latence mesurée depuis l'heure d'envoi prévue jusqu'à la
réception du delta par le joueur (pas de _coordinated omission_). CPU de l'API lu dans
`/proc/<pid>/stat`.

```
bun run bots.ts --api https://api… --origin https://el-presidente… --tables 100 --players 4 \
  --think 300 --seconds 30 --api-pid <pid du processus API>
```

## 14/10/2026 — machine de développement (4 vCPU), générateur sur la même machine

⚠️ Le générateur partageait la machine avec le serveur : chiffres **indicatifs**, à refaire
depuis une machine séparée contre un CX23.

| Tables × joueurs | Connexions | Coups/s | p50    | p95    | p99    | p99,9   | CPU API / coup | Erreurs |
| ---------------- | ---------- | ------- | ------ | ------ | ------ | ------- | -------------- | ------- |
| 5 × 4            | 20         | 170     | 1,6 ms | 2,9 ms | 4,6 ms | 7,8 ms  | 0,74 ms        | 0       |
| 100 × 4          | 400        | 1 108   | 1,6 ms | 3,0 ms | 5,3 ms | 10,3 ms | 0,36 ms        | 0       |

Mémoire résidente sous 400 connexions : API 59 Mo, HAProxy 21 Mo. Générateur : 66 Mo,
8 s de CPU pour 30 s de charge (pas le facteur limitant).

Le CPU par coup baisse quand la charge monte : les écritures en base sont groupées (une
transaction pour toutes les tables actives toutes les ~10 ms).
