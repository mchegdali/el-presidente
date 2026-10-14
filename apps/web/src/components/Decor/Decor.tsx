// Décors : guirlande de papel picado et logo (sombrero + moustache).

import styles from './Decor.module.css';

const FLAG_COLORS = ['#d6246e', '#f2b705', '#0fa3a3', '#e0631a', '#1f7a4d', '#8e44ad'];

function Flag({ color, variant }: { color: string; variant: number }) {
  const hole = '#1b1033';
  return (
    <svg viewBox="0 0 60 72" className={styles.flag} aria-hidden="true">
      <path d="M2 2h56v58l-5 8-5-8-5 8-4-8-5 8-4-8-5 8-4-8-5 8-5-8-5 8z" fill={color} />
      {variant % 3 === 0 && (
        <g fill={hole}>
          <circle cx="30" cy="28" r="5" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <ellipse
                key={i}
                cx={Math.round(30 + 11 * Math.cos(a))}
                cy={Math.round(28 + 11 * Math.sin(a))}
                rx="3.2"
                ry="3.2"
              />
            );
          })}
          <path d="M10 50l4-4 4 4-4 4zM42 50l4-4 4 4-4 4zM26 50l4-4 4 4-4 4z" />
        </g>
      )}
      {variant % 3 === 1 && (
        <g fill={hole}>
          <path d="M30 12l6 14-6 14-6-14z" />
          <path d="M12 22l4 8-4 8-4-8zM48 22l4 8-4 8-4-8z" />
          <circle cx="16" cy="50" r="2.5" />
          <circle cx="30" cy="50" r="3.5" />
          <circle cx="44" cy="50" r="2.5" />
        </g>
      )}
      {variant % 3 === 2 && (
        <g fill={hole}>
          <path d="M30 14c6 6 10 12 10 18a10 10 0 0 1-20 0c0-6 4-12 10-18z" />
          <circle cx="12" cy="14" r="2.5" />
          <circle cx="48" cy="14" r="2.5" />
          <path d="M8 46h44l-4 6H12z" />
        </g>
      )}
    </svg>
  );
}

export function PapelPicado({ count = 14 }: { count?: number }) {
  return (
    <div className={styles.papel} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Flag key={i} color={FLAG_COLORS[i % FLAG_COLORS.length]!} variant={i} />
      ))}
    </div>
  );
}

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 100" width={size} height={(size * 100) / 120} aria-hidden="true" className={styles.logo}>
      <ellipse cx="60" cy="52" rx="56" ry="12" fill="#1f7a4d" stroke="#2b1a12" strokeWidth="3" />
      <ellipse cx="60" cy="52" rx="46" ry="7" fill="none" stroke="#f2b705" strokeWidth="2.5" strokeDasharray="5 4" />
      <path d="M36 52c0-28 9-44 24-44s24 16 24 44z" fill="#1f7a4d" stroke="#2b1a12" strokeWidth="3" />
      <path d="M37 40h46v9H37z" fill="#f2b705" stroke="#2b1a12" strokeWidth="2" />
      <path d="M41 45l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3" stroke="#d6246e" strokeWidth="2" fill="none" />
      <path
        d="M60 74c-8-6-21-6-28 3-4 6-13 5-13-1 1 9 13 15 23 9 7-3 13-4 18-2 5-2 11-1 18 2 10 6 22 0 23-9 0 6-9 7-13 1-7-9-20-9-28-3z"
        fill="#2b1a12"
      />
    </svg>
  );
}
