-- Remove Health Canada NOC nodes that are leaf/isolated (degree <= 1) across the
-- whole graph: 68,221 leaf (degree 1) + 7 isolated (degree 0) = 68,228 nodes.
-- Cascades remove their single edge, NOC chunks, synonyms, and crosswalk rows
-- (all FKs to kg_node are cascade/set-null). The 10,961 non-leaf NOC nodes
-- (degree >= 2) are kept and remain tracked in kg_noc_node_audit for separate
-- handling. Targets are taken from the kg_noc_node_audit snapshot.

set statement_timeout = 0;

update kg_noc_node_audit
set deleted = true
where degree <= 1;

delete from kg_node
where id in (
  select node_id from kg_noc_node_audit where degree <= 1
);
