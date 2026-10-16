-- Réglages de stockage (aucune logique) : la ligne d'une manche est réécrite à chaque
-- coup. Avec de la place libre dans chaque page et aucune colonne indexée modifiée,
-- Postgres fait des mises à jour HOT (sans toucher aux index) ; un autovacuum plus
-- fréquent sur cette table évite le gonflement.
ALTER TABLE "games" SET (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 200,
  autovacuum_analyze_scale_factor = 0.05
);
--> statement-breakpoint
ALTER TABLE "lobbies" SET (fillfactor = 85);
