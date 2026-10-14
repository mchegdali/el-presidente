import { Logo } from '@/components/Decor/Decor';
import { PlayingCard } from '@/components/PlayingCard/PlayingCard';
import styles from './Home.module.css';

export function Hero() {
  return (
    <header className={styles.hero}>
      <Logo size={110} />
      <h1 className={`${styles.title} title-rye`}>El Presidente</h1>
      <p className={styles.tagline}>Le jeu du Président, à la mexicaine. ¡Ándale!</p>
      <div className={styles.fan} aria-hidden="true">
        {['QC', 'KH', '2S', 'JD'].map((c, i) => (
          <PlayingCard key={c} card={c} className={styles.fanCard} style={{ rotate: `${-24 + i * 16}deg` }} />
        ))}
      </div>
    </header>
  );
}
