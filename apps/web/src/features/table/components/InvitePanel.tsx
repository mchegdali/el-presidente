'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/Button/Button';
import { Panel } from '@/components/Panel/Panel';
import styles from './InvitePanel.module.css';

const noop = () => () => {};

export function InvitePanel({ code }: { code: string }) {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => '',
  );
  const url = origin ? `${origin}/t/${code}` : '';
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!showQr || !url || qr) return;
    // Bibliothèque QR chargée seulement à la demande.
    void import('qrcode').then((QRCode) =>
      QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#2b1a12', light: '#fff4dc' } }).then(setQr),
    );
  }, [showQr, url, qr]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copiez ce lien :', url);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'El Presidente', text: '¡Ven a jugar! Rejoins ma table de Président :', url });
        return;
      } catch {
        // partage annulé : on retombe sur la copie
      }
    }
    await copy();
  };

  return (
    <Panel>
      <div className={styles.code}>
        <span className="muted">Code de la table</span>
        <strong>{code}</strong>
      </div>
      <p className={styles.url}>{url}</p>
      <div className={styles.actions}>
        <Button size="small" onClick={share}>
          Inviter
        </Button>
        <Button size="small" variant="gold" onClick={copy}>
          {copied ? 'Lien copié ✓' : 'Copier le lien'}
        </Button>
        <Button size="small" variant="green" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Masquer le QR' : 'QR code'}
        </Button>
      </div>
      {showQr && qr && <div className={styles.qr} dangerouslySetInnerHTML={{ __html: qr }} />}
    </Panel>
  );
}
