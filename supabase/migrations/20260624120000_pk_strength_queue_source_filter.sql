-- Add a source filter to the PK strength-review queue so the pharmacist can do
-- "monographs first, then PubMed" (monographs are cleaner than literature).
-- p_sources is an optional allow-list intersected with the reviewable set
-- (CPS_MONOGRAPH / HC_MONOGRAPH / PUBMED): null = all reviewable, e.g.
-- ['CPS_MONOGRAPH','HC_MONOGRAPH'] = monographs only, ['PUBMED'] = PubMed only.
-- Drop + recreate because the signature changes.

drop function if exists kg_explorer_pk_strength_queue(text, text, boolean, text, int, int);

create or replace function kg_explorer_pk_strength_queue(
  p_passcode text,
  p_relation text default null,
  p_only_unspecified boolean default true,
  p_status text default 'candidate',
  p_sources text[] default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_total int;
  v_items jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  select count(*) into v_total
  from kg_edge e
  where e.relation in ('inhibits_enzyme', 'induces_enzyme')
    and e.source in ('CPS_MONOGRAPH', 'HC_MONOGRAPH', 'PUBMED')
    and (p_sources is null or e.source = any(p_sources))
    and (p_relation is null or e.relation::text = p_relation)
    and (p_status is null or e.review_status::text = p_status)
    and (
      not p_only_unspecified
      or coalesce(e.properties->>'strength', 'unspecified') = 'unspecified'
    );

  with subc as (
    select target_id as enzyme_id, count(*)::int as n
    from kg_edge
    where relation = 'metabolized_by'
    group by target_id
  )
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_items
  from (
    select
      e.id,
      e.relation,
      e.source,
      e.source_id,
      e.target_id,
      coalesce(e.properties->>'strength', 'unspecified') as strength,
      e.properties->>'quote' as quote,
      e.extraction_confidence,
      e.review_status,
      e.citations,
      mn.canonical_name as modulator_name,
      mn.type as modulator_type,
      en.canonical_name as enzyme_name,
      coalesce(sc.n, 0) as substrate_count
    from kg_edge e
    join kg_node mn on mn.id = e.source_id
    join kg_node en on en.id = e.target_id
    left join subc sc on sc.enzyme_id = e.target_id
    where e.relation in ('inhibits_enzyme', 'induces_enzyme')
      and e.source in ('CPS_MONOGRAPH', 'HC_MONOGRAPH', 'PUBMED')
      and (p_sources is null or e.source = any(p_sources))
      and (p_relation is null or e.relation::text = p_relation)
      and (p_status is null or e.review_status::text = p_status)
      and (
        not p_only_unspecified
        or coalesce(e.properties->>'strength', 'unspecified') = 'unspecified'
      )
    order by
      coalesce(sc.n, 0) desc,
      e.extraction_confidence desc nulls last,
      mn.canonical_name asc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

revoke all on function kg_explorer_pk_strength_queue(text, text, boolean, text, text[], int, int) from public;
grant execute on function kg_explorer_pk_strength_queue(text, text, boolean, text, text[], int, int) to anon, authenticated;

notify pgrst, 'reload schema';
