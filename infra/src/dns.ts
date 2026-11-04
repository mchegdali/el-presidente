// Zone DNS chez OVH : l'API pointe sur le serveur, le site sur Vercel, et seul Let's Encrypt
// peut émettre des certificats pour l'API (CAA).
//
// Identifiants OVH (ESC) : jeton limité à /domain/zone/<zone>/* (GET, POST, PUT, DELETE).

import * as ovh from '@ovhcloud/pulumi-ovh';
import { config } from './config';
import { ipv4, ipv6 } from './server';

const TTL = 300;

const record = (id: string, fieldtype: string, subdomain: string, target: ovh.domain.ZoneRecordArgs['target']) =>
  new ovh.domain.ZoneRecord(id, { zone: config.zone, subdomain, fieldtype, target, ttl: TTL });

record('api-a', 'A', config.apiSubdomain, ipv4);
record('api-aaaa', 'AAAA', config.apiSubdomain, ipv6);
record('api-caa', 'CAA', config.apiSubdomain, '0 issue "letsencrypt.org"');
// Site : CNAME générique de Vercel (le domaine est déclaré dans le projet, voir vercel.ts).
record('web-cname', 'CNAME', config.webSubdomain, 'cname.vercel-dns.com.');
