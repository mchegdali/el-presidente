import type { Metadata } from 'next';
import TableRoom from '@/components/TableRoom';

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Table ${code.toUpperCase()} — El Presidente`,
    description: '¡Ven a jugar! Rejoignez la partie de Président.',
  };
}

export default async function TablePage({ params }: Props) {
  const { code } = await params;
  return <TableRoom code={code.toUpperCase()} />;
}
