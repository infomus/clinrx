-- Index the child FK columns referencing kg_node that are NOT covered by an
-- index with the column leading. Without these, deleting kg_node rows cascades
-- with a per-row sequential scan of the child table (catastrophic for the bulk
-- NOC delete — kg_chunk alone is 343k rows scanned per deleted node).

-- kg_chunk only has (source, node_id); node_id is not leading.
create index if not exists kg_chunk_node_id_idx on kg_chunk (node_id);

-- crosswalk: source_a_node_id is covered by the unique (source_a_node_id,
-- source_b_node_id) index; source_b_node_id is not leading anywhere.
create index if not exists kg_source_crosswalk_source_b_node_idx
  on kg_source_crosswalk (source_b_node_id);

-- interaction_evaluation_run.resolved_source_id / resolved_target_id (set null)
-- have no index.
create index if not exists interaction_evaluation_run_resolved_source_idx
  on interaction_evaluation_run (resolved_source_id);
create index if not exists interaction_evaluation_run_resolved_target_idx
  on interaction_evaluation_run (resolved_target_id);

-- pubmed_interaction_candidate has (resolved_source_id, resolved_target_id);
-- resolved_target_id is not leading.
create index if not exists pubmed_interaction_candidate_resolved_target_idx
  on pubmed_interaction_candidate (resolved_target_id);
