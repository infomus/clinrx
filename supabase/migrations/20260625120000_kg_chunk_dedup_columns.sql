-- Monograph chunk dedup metadata (non-destructive). Many single-substance
-- products carry ~98% identical monographs; we mark redundancy instead of
-- deleting, so the divergent 2% is always preserved with provenance.
--   dedup_substance_id  the ingredient (moiety) this dedup grouping is scoped to
--   dedup_group_id      near-duplicate chunks (same substance+section) share this
--   is_canonical        true for the one representative per group (default true,
--                       so un-processed chunks are all included by retrieval)
--   dedup_product_count how many products contributed to the group (provenance)
-- Retrieval selects is_canonical chunks: one boilerplate rep PLUS one per
-- divergence cluster = the full deduplicated set, divergences intact.
alter table kg_chunk
  add column if not exists dedup_substance_id uuid,
  add column if not exists dedup_group_id uuid,
  add column if not exists is_canonical boolean not null default true,
  add column if not exists dedup_product_count int;

create index if not exists kg_chunk_dedup_idx
  on kg_chunk (dedup_substance_id, is_canonical)
  where dedup_substance_id is not null;
