import { RANKS } from '@el-presidente/game';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/Page/Page';
import { PlayingCard } from '@/components/PlayingCard/PlayingCard';
import styles from './cartes.module.css';

export const metadata: Metadata = { title: 'La baraja — El Presidente' };

const SUITS = ['H', 'D', 'C', 'S'];

export default function CardsPage() {
  return (
    <Page>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Accueil
        </Link>
        <h1 className="title-rye">La Baraja</h1>
        <p className="muted">Les 52 cartes d&apos;El Presidente, de la plus faible à la plus forte.</p>
      </header>
      {SUITS.map((s) => (
        <section key={s} className={styles.row}>
          {RANKS.split('').map((r) => (
            <PlayingCard key={r + s} card={r + s} className={styles.card} />
          ))}
        </section>
      ))}
      <section className={styles.row}>
        <PlayingCard className={styles.card} />
      </section>
    </Page>
  );
}
