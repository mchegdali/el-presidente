import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'rosa' | 'gold' | 'green' | 'ghost';
  size?: 'small' | 'normal' | 'big';
  block?: boolean;
};

export function Button({
  variant = 'rosa',
  size = 'normal',
  block = false,
  className = '',
  type = 'button',
  ...rest
}: Props) {
  const classes = [styles.btn, styles[variant], size !== 'normal' && styles[size], block && styles.block, className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
