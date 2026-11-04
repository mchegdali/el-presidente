import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PapelPicado } from '@/components/Decor/Decor';
import { Loading, Page } from '@/components/Page/Page';
import { TableRoom } from '@/features/table/components/TableRoom';
import { earlySocketScript } from '@/features/table/connection/early-socket';
import { API_WS_URL } from '@/lib/config';

type Props = { params: Promise<{ code: string }> };

const INVITE = {
  title: 'On vous attend à la table ! — El Presidente',
  description: '¡Ven a jugar! Rejoignez la partie de Président : un compte Google suffit, rien à installer.',
};

// Un `openGraph` de page remplace entièrement celui du parent, image comprise : tout est
// repris ici (image : app/opengraph-image.png).
const IMAGE = { url: '/opengraph-image.png', width: 1200, height: 630, alt: 'El Presidente' };
export const metadata: Metadata = {
  title: 'Table — El Presidente',
  description: INVITE.description,
  openGraph: { ...INVITE, type: 'website', siteName: 'El Presidente', locale: 'fr_FR', images: [IMAGE] },
  twitter: { ...INVITE, card: 'summary_large_image', images: [IMAGE] },
};

/**
 * Coquille statique (servie du cache) : script d'ouverture anticipée de la socket et écran
 * d'attente ; seul le code de table, lu dans l'URL, est rendu à la demande.
 */
export default function TablePage({ params }: Props) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: earlySocketScript(API_WS_URL) }} />
      <Suspense
        fallback={
          <>
            <PapelPicado />
            <Page centered>
              <Loading />
            </Page>
          </>
        }
      >
        <Room params={params} />
      </Suspense>
    </>
  );
}

async function Room({ params }: Props) {
  const { code } = await params;
  return <TableRoom code={code.toUpperCase()} />;
}
