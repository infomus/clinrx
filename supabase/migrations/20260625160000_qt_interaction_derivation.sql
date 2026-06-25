-- Derive pharmacodynamic QT-prolongation interactions from class co-membership:
-- any two distinct QT-prolonging agents have an additive QTc/TdP interaction.
-- This is the PD analog of kg_pk_interaction. Draft severity (pharmacist to
-- confirm): only known x known is moderate; everything else minor — matching
-- Lexicomp's conservative QT rating (e.g. moderate x indeterminate -> Minor).
-- The QT class-membership edges are candidate/LLM-extracted; like the PK view this
-- does NOT filter review_status (it's the review surface) — gate on 'published'
-- before any runtime-facing use.
create or replace view kg_qt_interaction as
select
  a.source_id as drug_a_id,
  b.source_id as drug_b_id,
  a.properties->>'risk_tier' as tier_a,
  b.properties->>'risk_tier' as tier_b,
  'qt_prolongation'::text as mechanism,
  case
    when a.properties->>'risk_tier' = 'known' and b.properties->>'risk_tier' = 'known'
      then 'moderate'::interaction_severity
    else 'minor'::interaction_severity
  end as severity
from kg_edge a
join kg_edge b
  on a.source_id < b.source_id
 and b.source = 'QT_PD_LAYER' and b.relation = 'subclass_of'
where a.source = 'QT_PD_LAYER' and a.relation = 'subclass_of';

-- A node's QT classification + how many co-prolonger partners it interacts with,
-- by combined severity. For the explorer drawer.
create or replace function kg_explorer_qt_interactions(
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
  v_self jsonb;
  v_partners jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  select to_jsonb(t) into v_self
  from (
    select e.properties->>'risk_tier' as risk_tier,
           e.properties->>'rationale' as rationale,
           e.properties->>'quote' as quote,
           e.review_status,
           e.extraction_confidence
    from kg_edge e
    where e.source = 'QT_PD_LAYER' and e.relation = 'subclass_of' and e.source_id = p_node_id
    limit 1
  ) t;

  if v_self is null then
    return jsonb_build_object('is_qt_agent', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('severity', severity, 'partners', n)), '[]'::jsonb) into v_partners
  from (
    select severity, count(*)::int as n
    from (
      select case when drug_a_id = p_node_id then drug_b_id else drug_a_id end as partner, severity
      from kg_qt_interaction
      where drug_a_id = p_node_id or drug_b_id = p_node_id
    ) p
    group by severity
  ) s;

  return jsonb_build_object('is_qt_agent', true, 'classification', v_self, 'partners_by_severity', v_partners);
end;
$$;

revoke all on function kg_explorer_qt_interactions(text, uuid) from public;
grant execute on function kg_explorer_qt_interactions(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
