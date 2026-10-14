// Edge Function `push` : envoie les notifications Web Push en attente
// (private.push_queue). Elle est réveillée par la base (pg_net) dès qu'une
// notification est mise en file, et par la tâche pg_cron en filet de sécurité.
//
// Elle n'accepte aucun paramètre : un appel extérieur ne peut que déclencher
// l'envoi de ce qui est déjà en file. Les clés VAPID sont lues dans private.config.
import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

// Seuls les services push des navigateurs sont contactés.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

function allowed(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

Deno.serve(async () => {
  const config = Object.fromEntries(
    (await sql`select key, value from private.config`).map((r) => [r.key as string, r.value as string]),
  );
  if (!config.vapid_public || !config.vapid_private) {
    return Response.json({ error: 'VAPID non configuré' }, { status: 503 });
  }
  webpush.setVapidDetails(config.vapid_subject ?? 'mailto:admin@example.com', config.vapid_public, config.vapid_private);

  // Réservation atomique : deux appels simultanés n'envoient pas deux fois.
  const jobs = await sql`
    update private.push_queue q set sent_at = now()
    from private.push_subscriptions s
    where q.sent_at is null and s.player_id = q.player_id and s.endpoint is not null
      and q.created_at > now() - interval '2 minutes'
    returning q.id, q.title, q.body, q.url, s.player_id, s.endpoint, s.p256dh, s.auth`;

  let sent = 0;
  await Promise.all(
    jobs.map(async (job) => {
      if (!allowed(job.endpoint)) return;
      try {
        await webpush.sendNotification(
          { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
          JSON.stringify({ title: job.title, body: job.body, url: job.url }),
          { TTL: 120, urgency: 'high' },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Abonnement expiré : on le désactive.
          await sql`update private.push_subscriptions set endpoint = null where player_id = ${job.player_id}`;
        } else {
          console.error('push failed', status, (err as Error).message);
        }
      }
    }),
  );
  return Response.json({ queued: jobs.length, sent });
});
