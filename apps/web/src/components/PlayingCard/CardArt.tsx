// Illustrations centrales des cartes (repère de la carte : 200 × 280).
import type { Suit } from '@el-presidente/game';

const INK = '#2b1a12';
const GOLD = '#f2b705';
const CREAM = '#fff8e8';
const SKIN = '#d9965b';
const SKIN_SHADE = '#b8743d';

type ArtProps = { suit: Suit; color: string };

// Arrondi des coordonnées calculées : Math.sin/cos peuvent différer au dernier
// chiffre entre Node et le navigateur, ce qui casserait l'hydratation.
const r2 = (n: number) => Math.round(n * 100) / 100;

const SuitUse = ({ suit, x, y, size, color }: { suit: Suit; x: number; y: number; size: number; color: string }) => (
  <use href={`#suit-${suit}`} x={x - size / 2} y={y - size / 2} width={size} height={size} fill={color} />
);

/** Cartes 3 à 10 : médaillon central + autant de petits symboles que la valeur. */
export function NumberArt({ suit, color, count }: ArtProps & { count: number }) {
  const cx = 106;
  const cy = 150;
  const pips = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: r2(cx + 62 * Math.cos(a)), y: r2(cy + 62 * Math.sin(a)) };
  });
  return (
    <g>
      <circle cx={cx} cy={cy} r={44} fill={color} opacity={0.12} />
      <circle cx={cx} cy={cy} r={44} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" />
      <circle cx={cx} cy={cy} r={36} fill="none" stroke={GOLD} strokeWidth={2} />
      <SuitUse suit={suit} x={cx} y={cy} size={50} color={color} />
      {pips.map((p, i) => (
        <SuitUse key={i} suit={suit} x={p.x} y={p.y} size={17} color={color} />
      ))}
    </g>
  );
}

/** As : un soleil aztèque. */
export function AceArt({ suit, color }: ArtProps) {
  const cx = 106;
  const cy = 150;
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    const a1 = a - Math.PI / 16;
    const a2 = a + Math.PI / 16;
    const r1 = 40;
    const rr = i % 2 === 0 ? 60 : 52;
    return {
      d: `M${r2(cx + r1 * Math.cos(a1))} ${r2(cy + r1 * Math.sin(a1))}L${r2(cx + rr * Math.cos(a))} ${r2(cy + rr * Math.sin(a))}L${r2(cx + r1 * Math.cos(a2))} ${r2(cy + r1 * Math.sin(a2))}Z`,
      fill: i % 2 === 0 ? GOLD : '#e0631a',
    };
  });
  return (
    <g>
      {rays.map((r, i) => (
        <path key={i} d={r.d} fill={r.fill} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      ))}
      <circle cx={cx} cy={cy} r={41} fill={CREAM} stroke={INK} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={35} fill="none" stroke={color} strokeWidth={2} strokeDasharray="2 3" />
      <SuitUse suit={suit} x={cx} y={cy} size={52} color={color} />
    </g>
  );
}

/** Le 2, carte maîtresse : rosace dorée et couronne. */
export function TwoArt({ suit, color }: ArtProps) {
  const cx = 106;
  const cy = 156;
  const scallops = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return { x: r2(cx + 44 * Math.cos(a)), y: r2(cy + 44 * Math.sin(a)) };
  });
  return (
    <g>
      {scallops.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={13} fill={GOLD} stroke={INK} strokeWidth={1.2} />
      ))}
      <circle cx={cx} cy={cy} r={44} fill={GOLD} />
      <circle cx={cx} cy={cy} r={38} fill={CREAM} stroke={INK} strokeWidth={2} />
      <SuitUse suit={suit} x={cx} y={cy + 2} size={46} color={color} />
      {/* couronne */}
      <path
        d={`M${cx - 26} ${cy - 54}l6 -26 10 14 10 -20 10 20 10 -14 6 26z`}
        fill={GOLD}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <rect x={cx - 26} y={cy - 56} width={52} height={8} rx={2} fill={GOLD} stroke={INK} strokeWidth={2} />
      <circle cx={cx} cy={cy - 52} r={2.5} fill={color} />
      <circle cx={cx - 14} cy={cy - 52} r={2} fill={color} />
      <circle cx={cx + 14} cy={cy - 52} r={2} fill={color} />
      <use href="#star" x={cx - 76} y={cy - 8} width={16} height={16} fill={GOLD} />
      <use href="#star" x={cx + 60} y={cy - 8} width={16} height={16} fill={GOLD} />
    </g>
  );
}

/** Roi : El Presidente — sombrero, moustache et écharpe présidentielle. */
export function PresidenteArt({ color }: ArtProps) {
  return (
    <g transform="translate(46 52)">
      <circle cx={60} cy={80} r={52} fill={GOLD} opacity={0.22} />
      {/* costume */}
      <path d="M6 170C8 138 28 122 60 120c32 2 52 18 54 50z" fill="#24233a" stroke={INK} strokeWidth={1.5} />
      <path d="M47 121l13 24 13-24z" fill={CREAM} />
      <path d="M52 126l8 5 8-5v10l-8-5-8 5z" fill={color} />
      {/* écharpe tricolore */}
      <path d="M20 129l7-4 77 45h-11z" fill="#1f7a4d" />
      <path d="M27 125l7-3 78 44-0 4h-8z" fill={CREAM} />
      <path d="M34 122l7-2 71 38v8z" fill="#c8102e" />
      <circle cx={84} cy={150} r={7} fill={GOLD} stroke={INK} strokeWidth={1.2} />
      <use href="#star" x={79} y={145} width={10} height={10} fill={color} />
      {/* tête */}
      <rect x={52} y={106} width={16} height={18} fill={SKIN_SHADE} />
      <circle cx={36} cy={90} r={5} fill={SKIN} stroke={INK} strokeWidth={1} />
      <circle cx={84} cy={90} r={5} fill={SKIN} stroke={INK} strokeWidth={1} />
      <ellipse cx={60} cy={88} rx={24} ry={27} fill={SKIN} stroke={INK} strokeWidth={1.5} />
      <path d="M43 76q8-6 15 0M62 76q8-6 15 0" stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <ellipse cx={51} cy={84} rx={2.6} ry={3.2} fill={INK} />
      <ellipse cx={69} cy={84} rx={2.6} ry={3.2} fill={INK} />
      <path d="M60 84q6 10-2 13" stroke={SKIN_SHADE} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      {/* moustache en guidon */}
      <path
        d="M60 100c-8-5-20-5-26 3-4 6-12 4-12-2 2 8 12 14 22 8 6-3 12-4 16-2 4-2 10-1 16 2 10 6 20 0 22-8 0 6-8 8-12 2-6-8-18-8-26-3z"
        fill={INK}
      />
      <path d="M53 110q7 4 14 0" stroke="#7a2b1a" strokeWidth={2} fill="none" strokeLinecap="round" />
      {/* sombrero */}
      <ellipse cx={60} cy={62} rx={58} ry={11} fill={color} stroke={INK} strokeWidth={1.8} />
      <ellipse cx={60} cy={62} rx={50} ry={7.5} fill="none" stroke={GOLD} strokeWidth={2} strokeDasharray="4 3" />
      <path d="M37 62c0-28 8-44 23-44s23 16 23 44z" fill={color} stroke={INK} strokeWidth={1.8} />
      <path d="M38 50h44v8H38z" fill={GOLD} stroke={INK} strokeWidth={1.2} />
      <path d="M42 54l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3" stroke={INK} strokeWidth={1.2} fill="none" />
    </g>
  );
}

const Flower = ({ x, y, r, petal, heart }: { x: number; y: number; r: number; petal: string; heart: string }) => (
  <g>
    {Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return (
        <circle
          key={i}
          cx={r2(x + r * Math.cos(a))}
          cy={r2(y + r * Math.sin(a))}
          r={r * 0.75}
          fill={petal}
          stroke={INK}
          strokeWidth={0.8}
        />
      );
    })}
    <circle cx={x} cy={y} r={r * 0.65} fill={heart} stroke={INK} strokeWidth={0.8} />
  </g>
);

/** Dame : La Catrina — calavera élégante au grand chapeau fleuri. */
export function CatrinaArt({ color }: ArtProps) {
  const bone = '#fbf6ec';
  return (
    <g transform="translate(46 52)">
      {/* robe */}
      <path d="M8 170c4-30 24-44 52-44s48 14 52 44z" fill="#3a2142" stroke={INK} strokeWidth={1.5} />
      <path
        d="M30 130a5 5 0 0 0 10 0a5 5 0 0 0 10 0a5 5 0 0 0 10 0a5 5 0 0 0 10 0a5 5 0 0 0 10 0a5 5 0 0 0 10 0"
        fill={CREAM}
        stroke={INK}
        strokeWidth={1}
      />
      {[40, 50, 60, 70, 80].map((x, i) => (
        <circle key={x} cx={x} cy={i % 2 ? 142 : 140} r={2.6} fill={GOLD} stroke={INK} strokeWidth={0.6} />
      ))}
      {/* tête de mort */}
      <rect x={53} y={108} width={14} height={20} fill={bone} stroke={INK} strokeWidth={1} />
      <ellipse cx={60} cy={104} rx={16} ry={11} fill={bone} stroke={INK} strokeWidth={1.4} />
      <ellipse cx={60} cy={86} rx={25} ry={25} fill={bone} stroke={INK} strokeWidth={1.4} />
      <ellipse cx={60} cy={100} rx={14} ry={9} fill={bone} />
      <circle cx={49} cy={88} r={10.5} fill="none" stroke={color} strokeWidth={4.5} strokeDasharray="3.2 2.4" />
      <circle cx={71} cy={88} r={10.5} fill="none" stroke={color} strokeWidth={4.5} strokeDasharray="3.2 2.4" />
      <circle cx={49} cy={88} r={7} fill={INK} />
      <circle cx={71} cy={88} r={7} fill={INK} />
      <circle cx={51} cy={86} r={1.8} fill={CREAM} />
      <circle cx={73} cy={86} r={1.8} fill={CREAM} />
      <path d="M60 96l-4 6q4 2 8 0z" fill={INK} />
      <path d="M48 107h24M51 104v6M54.5 104v6M58 104v6M61.5 104v6M65 104v6M68.5 104v6" stroke={INK} strokeWidth={1.2} />
      <circle cx={38} cy={98} r={2.4} fill="#e0631a" />
      <circle cx={82} cy={98} r={2.4} fill="#e0631a" />
      <Flower x={60} y={70} r={3} petal={color} heart={GOLD} />
      {/* chapeau */}
      <path d="M90 50c8-14 20-24 26-30-2 12-10 26-22 34z" fill="#f4e3c3" stroke={INK} strokeWidth={1.2} />
      <ellipse cx={60} cy={62} rx={58} ry={10} fill={color} stroke={INK} strokeWidth={1.8} />
      <path d="M36 62c2-16 10-24 24-24s22 8 24 24z" fill={color} stroke={INK} strokeWidth={1.8} />
      <Flower x={34} y={54} r={5} petal="#d6246e" heart={GOLD} />
      <Flower x={50} y={44} r={4.5} petal={GOLD} heart="#e0631a" />
      <Flower x={70} y={46} r={5} petal="#ef5d97" heart={GOLD} />
      <Flower x={86} y={56} r={4} petal="#e0631a" heart={CREAM} />
    </g>
  );
}

/** Valet : El Luchador — masque de lucha libre. */
export function LuchadorArt({ color }: ArtProps) {
  return (
    <g transform="translate(46 52)">
      {/* cordes du ring */}
      <path d="M-4 52h128M-4 64h128" stroke="#c8102e" strokeWidth={3} opacity={0.5} />
      <path d="M-4 58h128" stroke={CREAM} strokeWidth={3} opacity={0.8} />
      {/* cape et épaules */}
      <path d="M12 128C2 148 0 162 0 170h120c0-8-2-22-12-42z" fill={color} stroke={INK} strokeWidth={1.5} />
      <path d="M8 170c2-28 18-46 40-50h24c22 4 38 22 40 50z" fill={SKIN} stroke={INK} strokeWidth={1.5} />
      <path d="M36 144q12 10 24 0q12 10 24 0" stroke={SKIN_SHADE} strokeWidth={2} fill="none" />
      <path d="M60 140v26" stroke={SKIN_SHADE} strokeWidth={1.5} />
      <rect x={50} y={104} width={20} height={20} fill={SKIN_SHADE} />
      {/* masque */}
      <path
        d="M60 30c24 0 31 24 31 50 0 24-14 38-31 38S29 104 29 80c0-26 7-50 31-50z"
        fill={color}
        stroke={INK}
        strokeWidth={1.8}
      />
      <path d="M60 34l7 16 17-2-12 11-12-4-12 4-12-11 17 2z" fill={GOLD} stroke={INK} strokeWidth={1} />
      <path d="M38 76c4-9 15-9 18 2-4 7-13 7-18-2z" fill={CREAM} stroke={GOLD} strokeWidth={3} />
      <path d="M82 76c-4-9-15-9-18 2 4 7 13 7 18-2z" fill={CREAM} stroke={GOLD} strokeWidth={3} />
      <circle cx={49} cy={78} r={2.8} fill={INK} />
      <circle cx={71} cy={78} r={2.8} fill={INK} />
      <path d="M33 92q6 10 14 6M87 92q-6 10-14 6" stroke={GOLD} strokeWidth={2.4} fill="none" strokeLinecap="round" />
      <ellipse cx={60} cy={102} rx={10} ry={7} fill={SKIN} stroke={GOLD} strokeWidth={2.4} />
      <path d="M54 102q6 4 12 0" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </g>
  );
}
