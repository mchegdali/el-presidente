export default function Rules({ open = false }: { open?: boolean }) {
  return (
    <details className="rules panel" open={open}>
      <summary className="title-rye">Las reglas de la casa</summary>
      <ul>
        <li>
          52 cartes, de 3 à 8 joueurs. Ordre : 3 &lt; 4 &lt; … &lt; R &lt; A &lt; <strong>2</strong>.
        </li>
        <li>
          Le premier joueur d&apos;un pli choisit le format : simple, paire, brelan ou carré. Tout le pli suit ce
          format.
        </li>
        <li>On suit avec une valeur égale ou supérieure, ou on passe. On peut passer puis revenir dans le même pli.</li>
        <li>Quand tout le monde passe, le dernier à avoir joué relance.</li>
        <li>
          <strong>Le 2 ferme le pli</strong> : celui qui le pose relance.
        </li>
        <li>
          <strong>Coupe à 4</strong> : dès que les 4 cartes d&apos;une valeur sont sur le pli (7, 7, 7, 7 ou 7-7 puis
          7-7), le pli est coupé et celui qui a complété la série relance. Un carré posé en ouverture coupe aussitôt.
        </li>
        <li>Le premier à se débarrasser de ses cartes est Président, le dernier Trou-du-cul.</li>
        <li>
          Manche suivante : le Trou-du-cul donne ses 2 meilleures cartes au Président, qui lui en rend 2 de son choix
          (1 carte entre Vice-Trou-du-cul et Vice-Président, à partir de 4 joueurs). Le Trou-du-cul commence.
        </li>
      </ul>
    </details>
  );
}
