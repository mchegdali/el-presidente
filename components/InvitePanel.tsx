'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InvitePanel({ code, compact = false }: { code: string; compact?: boolean }) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/t/${code}`);
  }, [code]);

  useEffect(() => {
    if (!showQr || !url || qr) return;
    QRCode.toString(url, { type: 'svg', margin: 1, color: { dark: '#2b1a12', light: '#fff4dc' } }).then(setQr);
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
    copy();
  };

  return (
    <section className={`panel invite ${compact ? 'invite--compact' : ''}`}>
      <div className="invite__code">
        <span className="muted">Code de la table</span>
        <strong>{code}</strong>
      </div>
      <p className="invite__url">{url}</p>
      <div className="invite__actions">
        <button type="button" className="btn btn--small" onClick={share}>
          Inviter
        </button>
        <button type="button" className="btn btn--small btn--gold" onClick={copy}>
          {copied ? 'Lien copié ✓' : 'Copier le lien'}
        </button>
        <button type="button" className="btn btn--small btn--green" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Masquer le QR' : 'QR code'}
        </button>
      </div>
      {showQr && qr && <div className="invite__qr" dangerouslySetInnerHTML={{ __html: qr }} />}
    </section>
  );
}
