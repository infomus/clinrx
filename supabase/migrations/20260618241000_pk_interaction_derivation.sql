-- Derive pharmacokinetic interactions from the CYP edges (live, no materialized
-- edges yet). A inhibits/induces enzyme E + B is a substrate of E => B's exposure
-- changes. Draft severity mapping (pharmacist to confirm):
--   strong modulator -> major, moderate -> moderate, weak/other -> minor.

create or replace view kg_pk_interaction as
select
  m.source_id as modulator_id,
  s.source_id as substrate_id,
  m.target_id as enzyme_id,
  case when m.relation = 'inhibits_enzyme' then 'inhibition' else 'induction' end as mechanism,
  (m.properties->>'strength') as modulator_strength,
  case when m.relation = 'inhibits_enzyme'
       then 'substrate_exposure_increased' else 'substrate_exposure_decreased' end as effect,
  case (m.properties->>'strength')
    when 'strong' then 'major'::interaction_severity
    when 'moderate' then 'moderate'::interaction_severity
    else 'minor'::interaction_severity end as severity
from kg_edge m
join kg_edge s
  on s.target_id = m.target_id
 and s.relation = 'metabolized_by'
 and s.source_id <> m.source_id
where m.relation in ('inhibits_enzyme', 'induces_enzyme');

-- PK interactions for a given node (as modulator or substrate), with names.
create or replace function kg_explorer_pk_interactions(
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

  select coalesce(jsonb_agg(to_jsonb(t) order by t.severity_rank, t.counterpart_name), '[]'::jsonb)
  into v_result
  from (
    -- this node is the substrate; counterpart modulates the enzyme
    select
      'affected_by'::text as role,
      pk.modulator_id as counterpart_id,
      cn.canonical_name as counterpart_name,
      en.canonical_name as enzyme,
      pk.mechanism, pk.modulator_strength, pk.effect, pk.severity,
      kg_explorer_severity_rank(pk.severity) as severity_rank
    from kg_pk_interaction pk
    join kg_node cn on cn.id = pk.modulator_id
    join kg_node en on en.id = pk.enzyme_id
    where pk.substrate_id = p_node_id
    union all
    -- this node modulates the enzyme; counterpart is the substrate affected
    select
      'affects'::text as role,
      pk.substrate_id, cn.canonical_name, en.canonical_name,
      pk.mechanism, pk.modulator_strength, pk.effect, pk.severity,
      kg_explorer_severity_rank(pk.severity)
    from kg_pk_interaction pk
    join kg_node cn on cn.id = pk.substrate_id
    join kg_node en on en.id = pk.enzyme_id
    where pk.modulator_id = p_node_id
  ) t;

  return v_result;
end;
$$;

revoke all on function kg_explorer_pk_interactions(text, uuid) from public;
grant execute on function kg_explorer_pk_interactions(text, uuid) to anon, authenticated;
