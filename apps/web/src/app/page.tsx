import Link from 'next/link';
import { PapelPicado } from '@/components/Decor/Decor';
import { Page } from '@/components/Page/Page';
import { Hero } from '@/features/home/Hero';
import { HomeForms } from '@/features/home/HomeForms';
import { Rules } from '@/features/rules/Rules';

// Page entièrement statique : la session est lue côté client.
export default function Home() {
  return (
    <>
      <PapelPicado />
      <Page>
        <Hero />
        <HomeForms />
        <Rules />
        <p style={{ textAlign: 'center', margin: '18px 0' }}>
          <Link href="/cartes">Voir toutes les cartes</Link>
        </p>
      </Page>
    </>
  );
}
