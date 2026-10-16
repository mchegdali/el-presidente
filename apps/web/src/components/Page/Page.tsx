import type { HTMLAttributes } from 'react';
import styles from './Page.module.css';

/** Conteneur de page ; `centered` pour les écrans courts (connexion, chargement). */
export function Page({
  centered = false,
  className = '',
  ...rest
}: HTMLAttributes<HTMLElement> & { centered?: boolean }) {
  return <main className={[styles.page, centered && styles.centered, className].filter(Boolean).join(' ')} {...rest} />;
}

export function Loading({ children = 'Barajando las cartas…' }: { children?: string }) {
  return <p className={`${styles.loading} title-rye`}>{children}</p>;
}
