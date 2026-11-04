// Storage Box Hetzner : réplique continue de la base (Litestream, SFTP). Un sous-compte
// dédié, limité à son dossier, mot de passe généré par Pulumi (chiffré dans l'état).

import * as hcloud from '@pulumi/hcloud';
import * as random from '@pulumi/random';
import { config } from './config';

const name = `presidente-${config.stack}`;
const labels = { app: 'el-presidente', stack: config.stack };

// Politique de mots de passe des Storage Boxes : longueur, chiffres, majuscules, spéciaux.
const password = (id: string) =>
  new random.RandomPassword(id, { length: 40, special: true, overrideSpecial: '-_.+', minSpecial: 2, minNumeric: 2 });

const box = new hcloud.StorageBox(
  `${name}-backup`,
  {
    location: config.location,
    storageBoxType: 'bx11',
    password: password(`${name}-backup-main`).result,
    // Seul le SSH (SFTP) est utile ; tout le reste est fermé.
    accessSettings: { sshEnabled: true, sambaEnabled: false, webdavEnabled: false, reachableExternally: true },
    deleteProtection: true,
    labels,
  },
  { protect: true },
);

const subPassword = password(`${name}-backup-litestream`);

const sub = new hcloud.StorageBoxSubaccount(`${name}-litestream`, {
  storageBoxId: box.id.apply(Number),
  homeDirectory: 'litestream',
  password: subPassword.result,
  description: 'Litestream (réplique SQLite)',
  accessSettings: { sshEnabled: true, sambaEnabled: false, webdavEnabled: false, reachableExternally: true },
  labels,
});

export const storageBox = {
  host: sub.server,
  user: sub.username,
  password: subPassword.result,
};
