import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/Card';
import { RANKS } from '@/lib/cards';

export const metadata: Metadata = { title: 'La baraja — El Presidente' };

const SUITS = ['H', 'D', 'C', 'S'];

export default function CardsPage() {
  return (
    <main className="page gallery">
      <header className="gallery__header">
        <Link href="/" className="link-back">
          ← Accueil
        </Link>
        <h1 className="title-rye">La Baraja</h1>
        <p className="muted">Les 52 cartes d&apos;El Presidente, de la plus faible à la plus forte.</p>
      </header>
      {SUITS.map((s) => (
        <section key={s} className="gallery__row">
          {RANKS.split('').map((r) => (
            <Card key={r + s} card={r + s} className="gallery__card" />
          ))}
        </section>
      ))}
      <section className="gallery__row">
        <Card className="gallery__card" />
      </section>
    </main>
  );
}
