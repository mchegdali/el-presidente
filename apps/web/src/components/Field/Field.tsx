import type { ComponentProps } from 'react';
import styles from './Field.module.css';

/** Champ libellé. */
export function Field({ label, code = false, ...input }: ComponentProps<'input'> & { label: string; code?: boolean }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input className={`${styles.input} ${code ? styles.code : ''}`} {...input} />
    </label>
  );
}

export function Input({ className = '', ...input }: ComponentProps<'input'>) {
  return <input className={`${styles.input} ${className}`} {...input} />;
}

export function Select({ className = '', ...select }: ComponentProps<'select'>) {
  return <select className={`${styles.input} ${styles.select} ${className}`} {...select} />;
}
