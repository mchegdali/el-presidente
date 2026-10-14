import { expect, test, type Browser, type Page } from '@playwright/test';

const API = 'http://localhost:4100';
const SHOTS = process.env.E2E_SCREENSHOTS;
const shot = async (p: Page, name: string) => {
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

/** Navigateur connecté (connexion de test de l'API, sans Google). */
async function player(browser: Browser, name: string): Promise<Page> {
  const res = await fetch(`${API}/test/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3100' },
    body: JSON.stringify({ name }),
  });
  const { cookie } = (await res.json()) as { cookie: string };
  const context = await browser.newContext();
  await context.addCookies(
    cookie.split('; ').map((pair) => {
      const i = pair.indexOf('=');
      return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: 'localhost', path: '/' };
    }),
  );
  return context.newPage();
}

test('trois joueurs : créer, rejoindre, jouer un coup, discuter', async ({ browser }) => {
  const [ana, beto, carla] = await Promise.all(['Ana', 'Beto', 'Carla'].map((n) => player(browser, n)));

  await ana!.goto('/');
  await shot(ana!, 'accueil');
  await ana!.getByRole('button', { name: 'Créer une table' }).click();
  await ana!.waitForURL(/\/t\/[A-Z0-9]{5}$/);
  const url = ana!.url();
  await expect(ana!.getByText('La sala de espera')).toBeVisible();

  for (const p of [beto!, carla!]) {
    await p.goto(url);
    await p.getByRole('button', { name: 'Prendre place' }).click();
    await expect(p.getByText('La sala de espera')).toBeVisible();
  }
  await expect(ana!.getByText('3/8')).toBeVisible();
  await shot(ana!, 'salon');

  // Chat en direct (socket) et historique.
  await beto!.getByRole('textbox', { name: 'Message' }).fill('¡Hola @Ana!');
  await beto!.getByRole('button', { name: 'Envoyer' }).click();
  await expect(ana!.getByText('¡Hola')).toBeVisible();

  await ana!.getByRole('button', { name: /Distribuer les cartes/ }).click();
  for (const p of [ana!, beto!, carla!]) await expect(p.getByText('Manche 1')).toBeVisible();

  // Celui qui a la Dame de cœur ouvre : il joue sa première carte jouable.
  const pages = [ana!, beto!, carla!];
  let opener: Page | undefined;
  for (const p of pages) if (await p.getByText("À vous d'ouvrir le pli !").isVisible()) opener = p;
  expect(opener).toBeDefined();
  const firstCard = opener!.locator('button[aria-pressed]').first();
  const cardName = await firstCard.locator('svg').getAttribute('aria-label');
  await firstCard.click();
  await opener!.getByRole('button', { name: /Jouer/ }).click();

  // Le coup apparaît sur le tapis de tout le monde.
  for (const p of pages) await expect(p.locator(`svg[aria-label="${cardName}"]`).first()).toBeVisible();
  await shot(beto!, 'partie');
  await expect(opener!.getByText("À vous d'ouvrir le pli !")).toHaveCount(0);
});
