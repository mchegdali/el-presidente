import { parseCard, rankOf } from '@el-presidente/game';
import { AceArt, CatrinaArt, LuchadorArt, NumberArt, PresidenteArt, TwoArt } from './CardArt';
import { cardName, indexLabel, loteriaName, rankCharOf, suitOfText, SUIT_COLORS } from './face';
import styles from './PlayingCard.module.css';

const INK = '#2b1a12';
const CREAM = '#fff8e8';
const GOLD = '#f2b705';

function CardFace({ card }: { card: string }) {
  const suit = suitOfText(card);
  const color = SUIT_COLORS[suit];
  const label = indexLabel(card);
  const name = loteriaName(card);
  const r = rankCharOf(card);

  let art;
  if (r === 'K') art = <PresidenteArt suit={suit} color={color} />;
  else if (r === 'Q') art = <CatrinaArt suit={suit} color={color} />;
  else if (r === 'J') art = <LuchadorArt suit={suit} color={color} />;
  else if (r === 'A') art = <AceArt suit={suit} color={color} />;
  else if (r === '2') art = <TwoArt suit={suit} color={color} />;
  else art = <NumberArt suit={suit} color={color} count={rankOf(parseCard(card)) + 2} />;

  return (
    <svg viewBox="0 0 200 280" className={styles.svg} role="img" aria-label={cardName(card)}>
      <rect x="2" y="2" width="196" height="276" rx="16" fill={CREAM} stroke={INK} strokeWidth="3" />
      <rect x="11" y="11" width="178" height="258" rx="10" fill="none" stroke={color} strokeWidth="2.5" />
      <rect
        x="16"
        y="16"
        width="168"
        height="248"
        rx="7"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeDasharray="2 4"
        opacity="0.7"
      />
      {art}
      {/* index */}
      <text
        x="38"
        y="60"
        textAnchor="middle"
        fontFamily="'Alfa Slab One', Georgia, serif"
        fontSize={label.length > 1 ? 36 : 46}
        fill={color}
      >
        {label}
      </text>
      <use href={`#suit-${suit}`} x="22" y="68" width="32" height="32" fill={color} />
      <use href={`#suit-${suit}`} x="156" y="22" width="24" height="24" fill={color} opacity="0.85" />
      {/* bandeau façon Lotería */}
      <path d="M11 232h178v27a10 10 0 0 1-10 10H21a10 10 0 0 1-10-10z" fill={color} />
      <path d="M11 232h178" stroke={GOLD} strokeWidth="2" />
      <text
        x="100"
        y="258"
        textAnchor="middle"
        fontFamily="Rye, Georgia, serif"
        fontSize={name.length > 11 ? 16 : 20}
        fill={CREAM}
        letterSpacing="0.5"
      >
        {name}
      </text>
    </svg>
  );
}

export function CardBack() {
  return (
    <svg viewBox="0 0 200 280" className={styles.svg} role="img" aria-label="Dos de carte">
      <rect x="2" y="2" width="196" height="276" rx="16" fill="#d6246e" stroke={INK} strokeWidth="3" />
      <rect x="12" y="12" width="176" height="256" rx="10" fill="url(#papel-picado)" stroke={CREAM} strokeWidth="3" />
      <circle cx="100" cy="132" r="56" fill={CREAM} stroke={GOLD} strokeWidth="5" />
      <circle cx="100" cy="132" r="48" fill="none" stroke="#d6246e" strokeWidth="2" strokeDasharray="4 4" />
      {/* sombrero et moustache */}
      <ellipse cx="100" cy="124" rx="40" ry="8" fill="#1f7a4d" stroke={INK} strokeWidth="2" />
      <path d="M84 124c0-18 6-28 16-28s16 10 16 28z" fill="#1f7a4d" stroke={INK} strokeWidth="2" />
      <path d="M84 116h32v6H84z" fill={GOLD} />
      <path
        d="M100 142c-6-4-15-4-20 2-3 5-9 3-9-1 1 6 9 10 16 6 5-2 9-3 13-1 4-2 8-1 13 1 7 4 15 0 16-6 0 4-6 6-9 1-5-6-14-6-20-2z"
        fill={INK}
      />
      {/* ruban */}
      <path d="M18 196h20l-6 12 6 12H18z M182 196h-20l6 12-6 12h20z" fill="#a3164c" stroke={INK} strokeWidth="2" />
      <rect x="30" y="190" width="140" height="26" rx="3" fill={GOLD} stroke={INK} strokeWidth="2.5" />
      <text x="100" y="209" textAnchor="middle" fontFamily="Rye, Georgia, serif" fontSize="15" fill={INK}>
        EL PRESIDENTE
      </text>
    </svg>
  );
}

type CardProps = {
  card?: string;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

/** Carte à jouer (face si `card` est donné, sinon dos). */
export function PlayingCard({ card, selected, dimmed, onClick, className = '', style }: CardProps) {
  const classes = [
    styles.card,
    selected && styles.selected,
    dimmed && styles.dimmed,
    onClick && styles.clickable,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const content = card ? <CardFace card={card} /> : <CardBack />;
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} onClick={onClick} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style}>
      {content}
    </div>
  );
}
