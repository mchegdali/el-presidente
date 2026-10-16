'use client';

import type { TableSnapshot } from '@el-presidente/game/protocol';
import { createContext, use } from 'react';
import type { TableActions } from './actions';
import type { TableConnection } from './connection/use-table';

export interface TableContextValue {
  conn: TableConnection;
  actions: TableActions;
  table: TableSnapshot;
  /** Siège du joueur courant (assis à la table). */
  me: number;
  isHost: boolean;
  /** Une manche est en cours (échange ou jeu). */
  inRound: boolean;
}

export const TableContext = createContext<TableContextValue | null>(null);

/** État de la table et connexion, pour tout composant rendu dans une table. */
export function useTableContext(): TableContextValue {
  const value = use(TableContext);
  if (value === null) throw new Error('useTableContext hors d’une table');
  return value;
}
