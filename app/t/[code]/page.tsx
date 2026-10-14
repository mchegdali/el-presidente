import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import TableRoom from '@/components/TableRoom';
import { UNKNOWN_TABLE_URL } from '@/lib/routes';

type Props = { params: Promise<{ code: string }> };

// Codes générés par create_lobby : 5 caractères sans I, O, 0 ni 1.
const CODE = /^[A-HJ-NP-Z2-9]{5}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const c = code.toUpperCase();
  return {
    title: CODE.test(c) ? `Table ${c} — El Presidente` : 'El Presidente',
    description: '¡Ven a jugar! Rejoignez la partie de Président.',
  };
}

export default async function TablePage({ params }: Props) {
  const { code } = await params;
  const c = code.toUpperCase();
  if (!CODE.test(c)) redirect(UNKNOWN_TABLE_URL);
  return <TableRoom code={c} />;
}
