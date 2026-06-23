-- Snapshot of every Health Canada NOC node with its current graph degree, ahead
-- of removing the leaf (degree-1) NOC nodes. Non-leaf NOC nodes are tracked here
-- (is_leaf = false) to be handled separately. This is a record/audit table; it
-- does not modify the graph.

create table if not exists kg_noc_node_audit (
  node_id uuid primary key,
  canonical_name text,
  type text,
  identifiers jsonb,
  degree int not null,
  is_leaf boolean not null,
  deleted boolean not null default false,
  captured_at timestamptz not null default now()
);

insert into kg_noc_node_audit (node_id, canonical_name, type, identifiers, degree, is_leaf)
select
  n.id,
  n.canonical_name,
  n.type::text,
  n.identifiers,
  coalesce(d.c, 0) as degree,
  coalesce(d.c, 0) = 1 as is_leaf
from kg_node n
left join (
  select node_id, count(*)::int as c
  from (
    select source_id as node_id from kg_edge
    union all
    select target_id as node_id from kg_edge
  ) x
  group by node_id
) d on d.node_id = n.id
where n.source = 'HEALTH_CANADA_NOC'
on conflict (node_id) do nothing;
