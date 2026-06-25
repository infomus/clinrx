-- Derive pairwise pharmacodynamic interactions from shared-axis co-membership:
-- two drugs that both contribute to the same additive-effect axis (both CNS
-- depressants, both anticholinergic, both hepatotoxic, …) have an additive PD
-- interaction. Generalizes kg_qt_interaction across all 17 PD axes. Draft severity
-- (pharmacist to confirm): high x high = moderate, else minor. Candidate edges;
-- gate on 'published' before runtime.
create or replace view kg_pd_interaction as
select
  a.source_id as drug_a_id,
  b.source_id as drug_b_id,
  ax.identifiers->>'functional_class' as axis,
  ax.canonical_name as axis_name,
  a.properties->>'magnitude' as magnitude_a,
  b.properties->>'magnitude' as magnitude_b,
  case
    when a.properties->>'magnitude' = 'high' and b.properties->>'magnitude' = 'high'
      then 'moderate'::interaction_severity
    else 'minor'::interaction_severity
  end as severity
from kg_edge a
join kg_edge b
  on a.source_id < b.source_id
 and a.target_id = b.target_id
 and b.source = 'PD_LAYER' and b.relation = 'subclass_of'
join kg_node ax on ax.id = a.target_id
where a.source = 'PD_LAYER' and a.relation = 'subclass_of';

-- A node's PD axes + how many co-contributor partners per axis (for the explorer).
create or replace function kg_explorer_pd_interactions(
  p_passcode text,
  p_node_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  select coalesce(jsonb_agg(jsonb_build_object(
           'axis', axis, 'axis_name', axis_name, 'magnitude', magnitude,
           'quote', quote, 'review_status', review_status, 'partners', partners
         ) order by partners desc), '[]'::jsonb)
  into v_result
  from (
    select
      ax.identifiers->>'functional_class' as axis,
      ax.canonical_name as axis_name,
      e.properties->>'magnitude' as magnitude,
      e.properties->>'quote' as quote,
      e.review_status::text as review_status,
      (select count(*) from kg_edge o
        where o.source = 'PD_LAYER' and o.relation = 'subclass_of'
          and o.target_id = e.target_id and o.source_id <> e.source_id)::int as partners
    from kg_edge e
    join kg_node ax on ax.id = e.target_id
    where e.source = 'PD_LAYER' and e.relation = 'subclass_of' and e.source_id = p_node_id
  ) t;

  return jsonb_build_object('axes', v_result);
end;
$$;

revoke all on function kg_explorer_pd_interactions(text, uuid) from public;
grant execute on function kg_explorer_pd_interactions(text, uuid) to anon, authenticated;

-- Resume tracking for the extraction (so a re-run after credit top-up skips
-- already-processed drugs instead of re-paying for them).
create table if not exists pd_processed (
  node_id uuid primary key,
  processed_at timestamptz not null default now()
);
grant select, insert on table pd_processed to service_role;

-- Seed with drugs that already have a PD edge (definitely processed this run).
insert into pd_processed (node_id)
select distinct source_id from kg_edge where source = 'PD_LAYER' and relation = 'subclass_of'
on conflict (node_id) do nothing;

notify pgrst, 'reload schema';
