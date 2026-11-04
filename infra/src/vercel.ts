// Projet Vercel existant (déploiements par Git, réglages gérés dans Vercel) : Pulumi n'y
// gère que l'adresse de l'API et le domaine du site.

import * as vercel from '@pulumiverse/vercel';
import { apiDomain, config, webDomain } from './config';

const project = vercel.getProjectOutput({ name: config.vercelProject, teamId: config.vercelTeamId });

new vercel.ProjectEnvironmentVariable('api-url', {
  projectId: project.id,
  teamId: config.vercelTeamId,
  key: 'NEXT_PUBLIC_API_URL',
  value: `https://${apiDomain}`,
  // `vercel dev` / `vercel env pull` aussi : l'API de production est la seule publique.
  targets: ['production', 'preview', 'development'],
  sensitive: false,
  comment: "URL publique de l'API Bun (Hetzner)",
});

new vercel.ProjectDomain('web', { projectId: project.id, teamId: config.vercelTeamId, domain: webDomain });
