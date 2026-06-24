-- Extend the PK strength-review surface to include PubMed-extracted edges.
-- The PubMed CYP extraction (scripts/extract-pubmed-cyp-edges.mjs) emits
-- source='PUBMED' candidate modulator edges that are also mostly 'unspecified'
-- strength; without this they would drive derived interactions at 'minor' with no
-- way for the pharmacist to grade them. Re-defines both review RPCs to treat
-- CPS_MONOGRAPH / HC_MONOGRAPH / PUBMED as the reviewable monograph+literature PK
-- sources. (FDA_DDI stays out — it's curated/published, not for strength review.)

create or replace function kg_explorer_pk_strength_queue(
  p_passcode text,
  p_relation text default null,
  p_only_unspecified boolean default true,
  p_status text default 'candidate',
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

create or replace function kg_explorer_grade_pk_edge(
  p_passcode text,
  p_edge_id uuid,
  p_action text,
  p_strength text default null,
  p_reviewer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row kg_edge;
  v_props jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  select * into v_row from kg_edge where id = p_edge_id;
  if not found then
    raise exception 'edge not found' using errcode = 'P0002';
  end if;
  if v_row.relation not in ('inhibits_enzyme', 'induces_enzyme')
     or v_row.source not in ('CPS_MONOGRAPH', 'HC_MONOGRAPH', 'PUBMED') then
    raise exception 'not a reviewable monograph/literature PK edge' using errcode = '28000';
  end if;

  v_props := coalesce(v_row.properties, '{}'::jsonb);

  if p_action = 'grade' then
    if p_strength is null or p_strength not in ('strong', 'moderate', 'weak') then
      raise exception 'invalid strength' using errcode = '22023';
    end if;
    update kg_edge set
      properties = v_props || jsonb_build_object(
        'strength', p_strength,
        'prior_strength', coalesce(v_props->>'strength', 'unspecified'),
        'reviewed_by_label', p_reviewer,
        'reviewed_action', 'graded'
      ),
      review_status = 'published',
      reviewed_at = now()
    where id = p_edge_id
    returning * into v_row;
  elsif p_action = 'reject' then
    update kg_edge set
      properties = v_props || jsonb_build_object(
        'reviewed_by_label', p_reviewer,
        'reviewed_action', 'rejected'
      ),
      review_status = 'rejected',
      reviewed_at = now()
    where id = p_edge_id
    returning * into v_row;
  elsif p_action = 'reset' then
    update kg_edge set
      properties = v_props || jsonb_build_object(
        'strength', 'unspecified',
        'reviewed_by_label', p_reviewer,
        'reviewed_action', 'reset'
      ),
      review_status = 'candidate',
      reviewed_at = null
    where id = p_edge_id
    returning * into v_row;
  else
    raise exception 'invalid action' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'strength', v_row.properties->>'strength',
    'review_status', v_row.review_status
  );
end;
$$;

notify pgrst, 'reload schema';
