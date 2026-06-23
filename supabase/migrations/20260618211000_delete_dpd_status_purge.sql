-- Delete the DPD nodes snapshotted in kg_dpd_status_purge_audit (36,213:
-- Cancelled Pre Market + Dormant + Cancelled Post Market cancelled >5y ago).
-- Cascade removes their edges, DPD chunks, synonyms and crosswalk rows.
set statement_timeout = 0;

update kg_dpd_status_purge_audit set deleted = true;

delete from kg_node
where id in (select node_id from kg_dpd_status_purge_audit);
