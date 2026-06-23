-- Snapshot the DPD product nodes to be purged by status/age, before deleting:
--   Cancelled Pre Market, Dormant, or Cancelled Post Market with the status date
--   (status_history_date = cancellation date) more than 5 years ago (< 2021-06-18).
-- Records what was matched and why; does not modify the graph.

create table if not exists kg_dpd_status_purge_audit (
  node_id uuid primary key,
  canonical_name text,
  status text,
  status_date text,
  din text,
  reason text not null,
  deleted boolean not null default false,
  captured_at timestamptz not null default now()
);

insert into kg_dpd_status_purge_audit (node_id, canonical_name, status, status_date, din, reason)
select
  n.id,
  n.canonical_name,
  n.identifiers->'status'->>0,
  n.identifiers->'status_history_date'->>0,
  n.identifiers->'din'->>0,
  case
    when n.identifiers->'status' ? 'Cancelled Pre Market' then 'cancelled_pre_market'
    when n.identifiers->'status' ? 'Dormant' then 'dormant'
    else 'cancelled_post_market_over_5y'
  end
from kg_node n
where n.source = 'HEALTH_CANADA_DPD'
  and (
    n.identifiers->'status' ? 'Cancelled Pre Market'
    or n.identifiers->'status' ? 'Dormant'
    or (
      n.identifiers->'status' ? 'Cancelled Post Market'
      and (n.identifiers->'status_history_date'->>0) < '2021-06-18'
    )
  )
on conflict (node_id) do nothing;

grant select, update on table kg_dpd_status_purge_audit to service_role;
