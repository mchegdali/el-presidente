import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/Page/Page';
import styles from './confidentialite.module.css';

export const metadata: Metadata = { title: 'Confidentialité — El Presidente' };

// Responsable du traitement et contact affichés sur la page.
const RESPONSABLE = 'Moustapha Chegdali';
const CONTACT = 'contact@chegdali.fr';
const MISE_A_JOUR = '5 novembre 2026';

// Chaque durée annoncée ici est appliquée par le code (apps/api/src/features/privacy/purge.ts,
// durée des sessions dans apps/api/src/features/auth/auth.ts) : les garder alignés.
export default function PrivacyPage() {
  const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
  return (
    <Page>
      <article className={styles.doc}>
        <header className={styles.header}>
          <Link href="/" className={styles.back}>
            ← Accueil
          </Link>
          <h1 className="title-rye">Confidentialité</h1>
          <p className="muted">Mise à jour : {MISE_A_JOUR}</p>
        </header>

        <p>
          El Presidente est un jeu de cartes gratuit, sans publicité ni mesure d&apos;audience. Cette page dit quelles
          données le jeu enregistre, pourquoi, combien de temps, et comment les faire supprimer.
        </p>

        <h2>Responsable</h2>
        <p>
          {RESPONSABLE}, joignable à {mail}.
        </p>

        <h2>Ce qui est enregistré</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Données</th>
              <th>Pourquoi</th>
              <th>Combien de temps</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Compte Google : nom, adresse e-mail, photo de profil, identifiant Google et jetons de connexion</td>
              <td>Vous connecter et vous reconnaître d&apos;une partie à l&apos;autre</td>
              <td>Tant que le compte existe</td>
            </tr>
            <tr>
              <td>Session : adresse IP, navigateur utilisé</td>
              <td>Sécurité du compte</td>
              <td>30 jours au plus (durée de la session), puis supprimée</td>
            </tr>
            <tr>
              <td>Tables : pseudo choisi, place, rôle, état des manches</td>
              <td>Faire fonctionner les parties</td>
              <td>
                Jusqu&apos;à 30 jours après la dernière activité de la table (coup, réglage ou message), puis supprimées
                ; ou dès que vous la quittez
              </td>
            </tr>
            <tr>
              <td>Messages du chat, avec le pseudo, l&apos;adresse IP et le port de connexion de l&apos;auteur</td>
              <td>Le chat ; l&apos;identification des auteurs est une obligation légale (LCEN, art. 6)</td>
              <td>1 an, puis supprimés automatiquement</td>
            </tr>
            <tr>
              <td>Signalements de messages : qui signale, motif</td>
              <td>Modération</td>
              <td>Avec le message signalé</td>
            </tr>
            <tr>
              <td>Abonnement aux notifications (si vous l&apos;activez) : adresse fournie par votre navigateur</td>
              <td>Vous prévenir quand c&apos;est votre tour ou qu&apos;on vous mentionne</td>
              <td>Jusqu&apos;à la désactivation, l&apos;expiration de l&apos;abonnement ou la suppression du compte</td>
            </tr>
          </tbody>
        </table>
        <p>
          Les bases légales sont l&apos;exécution du service que vous demandez (compte, parties, chat, notifications),
          une obligation légale (adresses IP des auteurs de messages) et l&apos;intérêt légitime à sécuriser les comptes
          (sessions).
        </p>

        <h2>Cookies</h2>
        <p>
          Un seul cookie, celui de la session, indispensable pour rester connecté. Aucun cookie de mesure
          d&apos;audience ni de publicité : rien à accepter.
        </p>

        <h2>Où sont les données</h2>
        <ul>
          <li>Le jeu, sa base de données et leur sauvegarde : Hetzner Online GmbH, à Helsinki (Finlande).</li>
          <li>
            Les pages du site : Vercel Inc. Elles ne contiennent aucune donnée personnelle, mais Vercel voit
            l&apos;adresse IP des visiteurs pour les servir.
          </li>
          <li>Google voit que vous vous connectez au jeu, et votre photo de profil est chargée depuis ses serveurs.</li>
          <li>
            Les notifications passent par le service de votre navigateur (Google, Mozilla ou Apple), chiffrées : il ne
            peut pas en lire le contenu.
          </li>
        </ul>
        <p>
          Vercel et Google sont des sociétés américaines. Leurs transferts de données vers les États-Unis relèvent du
          cadre de protection des données entre l&apos;Union européenne et les États-Unis.
        </p>
        <p>Rien n&apos;est vendu ni transmis à qui que ce soit d&apos;autre, sauf sur réquisition judiciaire.</p>

        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander l&apos;accès à vos données, leur correction, leur suppression (suppression du compte,
          avec ses sessions, tables et abonnements) ou leur export, et vous opposer à leur traitement : écrivez à {mail}
          . Réponse sous un mois. Les messages envoyés dans le chat sont détachés du compte mais gardés, avec leur
          pseudo, leur adresse IP et leur port de connexion, jusqu&apos;à leur suppression au bout d&apos;un an
          (obligation légale ci-dessus).
        </p>
        <p>
          En cas de désaccord, vous pouvez saisir la{' '}
          <a href="https://www.cnil.fr/fr/plaintes" rel="noreferrer">
            CNIL
          </a>
          .
        </p>
      </article>
    </Page>
  );
}
