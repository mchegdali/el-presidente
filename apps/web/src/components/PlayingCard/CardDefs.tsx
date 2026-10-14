// Définitions SVG partagées par toutes les cartes (symboles des couleurs, motifs).
// Rendu une seule fois dans le layout ; les cartes y font référence via <use href="#…">.

export default function CardDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="suit-H" viewBox="0 0 100 100">
          <path d="M50 90C22 68 5 50 5 30 5 15 17 5 31 5c9 0 15 5 19 12 4-7 10-12 19-12 14 0 26 10 26 25 0 20-17 38-45 60z" />
        </symbol>
        <symbol id="suit-D" viewBox="0 0 100 100">
          <path d="M50 3Q68 30 88 50 68 70 50 97 32 70 12 50 32 30 50 3z" />
        </symbol>
        <symbol id="suit-S" viewBox="0 0 100 100">
          <path d="M50 5c12 18 44 36 44 57 0 14-10 22-22 22-9 0-15-5-18-11 1 11 5 19 13 23H33c8-4 12-12 13-23-3 6-9 11-18 11C16 84 6 76 6 62 6 41 38 23 50 5z" />
        </symbol>
        <symbol id="suit-C" viewBox="0 0 100 100">
          <circle cx="50" cy="27" r="19" />
          <circle cx="27" cy="58" r="19" />
          <circle cx="73" cy="58" r="19" />
          <path d="M45 50h10c0 22 5 35 13 45H32c8-10 13-23 13-45z" />
        </symbol>
        <symbol id="star" viewBox="0 0 100 100">
          <path d="M50 4l13 31 33 3-25 22 8 33-29-18-29 18 8-33L4 38l33-3z" />
        </symbol>
        <pattern id="papel-picado" width="28" height="28" patternUnits="userSpaceOnUse">
          <rect width="28" height="28" fill="#c01e60" />
          <path d="M14 4l4 10-4 10-4-10z" fill="#ef5d97" />
          <circle cx="0" cy="0" r="3.2" fill="#f2b705" />
          <circle cx="28" cy="0" r="3.2" fill="#f2b705" />
          <circle cx="0" cy="28" r="3.2" fill="#f2b705" />
          <circle cx="28" cy="28" r="3.2" fill="#f2b705" />
          <circle cx="4" cy="14" r="1.6" fill="#ffd9e8" />
          <circle cx="24" cy="14" r="1.6" fill="#ffd9e8" />
        </pattern>
      </defs>
    </svg>
  );
}
