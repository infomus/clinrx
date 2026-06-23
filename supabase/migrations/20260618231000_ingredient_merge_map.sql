-- Mapping of redundant ingredient nodes (losers) to their canonical node for the
-- matched-crosswalk-driven consolidation (small clusters only; minerals deferred).
create table if not exists kg_ingredient_merge_map (
  node_id uuid primary key,
  canonical_id uuid not null,
  loser_name text,
  loser_source text,
  cluster_size int,
  captured_at timestamptz not null default now()
);
grant select, insert, update, delete on table kg_ingredient_merge_map to service_role;
