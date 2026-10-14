// Identité anonyme du navigateur : un jeton secret gardé dans localStorage.
// Il permet de retrouver sa place après un rafraîchissement.

const TOKEN_KEY = 'presidente:token';
const NAME_KEY = 'presidente:name';

function randomToken() {
  if (typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let memoryToken: string | null = null;

export function getToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = randomToken();
      localStorage.setItem(TOKEN_KEY, token);
    }
    return token;
  } catch {
    // Navigation privée stricte : le jeton ne survivra pas au rechargement.
    memoryToken ??= randomToken();
    return memoryToken;
  }
}

export function getSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // ignore
  }
}
