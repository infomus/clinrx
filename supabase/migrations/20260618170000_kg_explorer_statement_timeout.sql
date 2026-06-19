-- High-cardinality drugs (sertraline = 468 nodes, paroxetine = 478) made the
-- grouped search exceed the anon role's ~3s statement_timeout while computing the
-- per-node chunk breakdown, and PostgREST surfaced the cancel as an error which
-- the UI showed as "No matches". These explorer RPCs are read-only and bounded;
-- give them a longer per-call statement_timeout (function-local, overrides the
-- role default) so big drugs return instead of being cancelled.

alter function kg_explorer_search(text, text, int)
  set statement_timeout = '20s';
alter function kg_explorer_search_grouped(text, text, int)
  set statement_timeout = '20s';
alter function kg_explorer_duplication(text, int)
  set statement_timeout = '20s';
alter function kg_explorer_edges(
  text, uuid, kg_relation, text[], text[], real, text, int, int
) set statement_timeout = '20s';
alter function kg_explorer_node_chunks(text, uuid, text, text, int, int)
  set statement_timeout = '20s';
alter function kg_explorer_node_chunk_stats(text, uuid)
  set statement_timeout = '20s';
alter function kg_explorer_node(text, uuid)
  set statement_timeout = '20s';
