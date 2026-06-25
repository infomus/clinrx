-- Candidate substances for the combined pharmacodynamic (PD) profile extraction:
-- ingredient nodes that have monograph evidence (a canonical monograph chunk via
-- a product). One LLM call per substance extracts its full PD profile across all
-- additive-effect axes at once (cheaper than one pass per axis). Read-only.
set statement_timeout = 0;

create table if not exists pd_extraction_candidate (
  node_id uuid primary key,
  chunk_count int
);

insert into pd_extraction_candidate (node_id, chunk_count)
select hi.target_id, count(*)::int
from kg_chunk c
join kg_edge hi on hi.source_id = c.node_id and hi.relation = 'has_ingredient'
join kg_node n on n.id = hi.target_id and n.type = 'ingredient'
where c.is_canonical
group by hi.target_id
on conflict (node_id) do nothing;

grant select on table pd_extraction_candidate to service_role;
