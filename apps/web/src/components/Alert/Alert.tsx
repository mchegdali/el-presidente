import type { ReactNode } from 'react';
import styles from './Alert.module.css';

/** Message d'erreur (annoncé aux lecteurs d'écran) ou bandeau d'information. */
export function Alert({
  tone = 'error',
  children,
  className = '',
}: {
  tone?: 'error' | 'notice';
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`${styles[tone]} ${className}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
