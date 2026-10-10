// Backend local pour développer sans Supabase : Postgres en mémoire (PGlite)
// avec les migrations, exposé comme l'API RPC de PostgREST (POST /rest/v1/rpc/<fn>).
// Pas de temps réel : le client bascule sur la synchronisation périodique.
//
//   npm run dev:backend   puis   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
import { createServer } from 'node:http';
import { createDb, rpc, RPC_ARGS } from '../tests/db.mjs';

const PORT = Number(process.env.PORT ?? 54321);
const db = await createDb();

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

// Les appels sont sérialisés, comme les verrous de ligne le feraient en vrai.
let queue = Promise.resolve();

createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const match = req.url?.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (req.method !== 'POST' || !match || !RPC_ARGS[match[1]]) return send(res, 404, { message: 'Not found' });

  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    queue = queue.then(async () => {
      try {
        const args = raw ? JSON.parse(raw) : {};
        send(res, 200, await rpc(db, match[1], args));
      } catch (err) {
        send(res, 400, { code: err.code ?? 'P0001', message: err.message, hint: err.hint ?? null, details: null });
      }
    });
  });
}).listen(PORT, () => {
  console.log(`Backend local El Presidente : http://localhost:${PORT}`);
});
