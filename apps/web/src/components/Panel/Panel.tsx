import type { HTMLAttributes } from 'react';
import styles from './Panel.module.css';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'div' | 'form' | 'details';
  narrow?: boolean;
  /** Action de formulaire (avec `as="form"`). */
  action?: (data: FormData) => void | Promise<void>;
};

/** Panneau crème bordé, la brique de base des écrans. */
export function Panel({ as: Tag = 'section', narrow = false, className = '', ...rest }: Props) {
  const classes = [styles.panel, narrow && styles.narrow, className].filter(Boolean).join(' ');
  return <Tag className={classes} {...(rest as object)} />;
}
