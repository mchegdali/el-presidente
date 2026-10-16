import { Result } from 'better-result';
import { Invalid } from '../../../shared/errors';

/** Nom affiché à la table : espaces normalisés, 1 à 20 caractères. */
export function cleanName(raw: string): Result<string, Invalid> {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 1) return Result.err(new Invalid({ message: 'Entrez votre nom.' }));
  if ([...name].length > 20) return Result.err(new Invalid({ message: 'Nom trop long (20 caractères max).' }));
  return Result.ok(name);
}

/** Nom par défaut tiré du compte, tronqué si besoin. */
export const defaultName = (accountName: string) =>
  [...accountName.trim().replace(/\s+/g, ' ')].slice(0, 20).join('').trim() || 'Joueur';
