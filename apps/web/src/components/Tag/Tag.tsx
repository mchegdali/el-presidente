import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export function Tag({
  variant = 'default',
  title,
  children,
}: {
  variant?: 'default' | 'role';
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={variant === 'role' ? `${styles.tag} ${styles.role}` : styles.tag} title={title}>
      {children}
    </span>
  );
}
