// Journal JSON en lignes, tamponné : une écriture système toutes les 100 ms au plus,
// jamais sur le chemin chaud d'un coup.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;
let buffer: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (buffer.length === 0) return;
  const out = buffer.join('');
  buffer = [];
  process.stdout.write(out);
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  buffer.push(JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }) + '\n');
  if (level === 'error') flush();
  else timer ??= setTimeout(flush, 100);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
  flush,
};
