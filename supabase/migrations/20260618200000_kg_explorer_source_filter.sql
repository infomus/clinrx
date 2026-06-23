-- Add an optional source filter (CPS / DPD / NOC / summary / manual) to the
-- explorer search RPCs. Drop the old 3-arg signatures and recreate with
-- p_sources text[] (PostgREST can't disambiguate a defaulted overload).

drop function if exists kg_explorer_search(text, text, int);
drop function if exists kg_explorer_search_grouped(text, text, int);

create or replace function kg_explorer_search(
  p_passcode text,
  p_query text,
  p_limit int default 20,
  p_sources text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);
  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  with matched_ids as (
    select id from kg_node where canonical_name ilike '%' || v_query || '%'
    union
    select s.node_id from kg_node_synonym s where s.synonym ilike '%' || v_query || '%'
  )
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_result
  from (
    select
      n.id, n.type, n.canonical_name, n.source, n.identifiers, n.summary,
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree,
      kg_node_chunk_breakdown(n.id) as chunks
    from kg_node n
    join matched_ids m on m.id = n.id
    where (p_sources is null or n.source = any (p_sources))
    order by
      (lower(n.canonical_name) = lower(v_query)) desc,
      similarity(n.canonical_name, v_query) desc,
      length(n.canonical_name) asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) t;

  return v_result;
end;
$$;

create or replace function kg_explorer_search_grouped(
  p_passcode text,
  p_query text,
  p_limit int default 40,
  p_sources text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);
  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  with matched_ids as (
    select id from kg_node where canonical_name ilike '%' || v_query || '%'
    union
    select s.node_id from kg_node_synonym s where s.synonym ilike '%' || v_query || '%'
  ),
  matched as (
    select
      n.id, n.type, n.source, n.canonical_name,
      kg_explorer_base_moiety(n.canonical_name) as moiety
    from kg_node n
    join matched_ids m on m.id = n.id
    where (p_sources is null or n.source = any (p_sources))
    limit 1500
  ),
  degree_b as (
    select node_id, count(*)::int as degree
    from (
      select source_id as node_id from kg_edge where source_id in (select id from matched)
      union all
      select target_id as node_id from kg_edge where target_id in (select id from matched)
    ) e
    group by node_id
  ),
  chunk_rows as materialized (
    select c.node_id, c.source,
      (c.section ~* '(warning|precaution|contraindication)') as is_safety
    from kg_chunk c
    where c.node_id in (select id from matched)
  ),
  counts as (
    select node_id, source as kind, count(*)::int as c from chunk_rows group by node_id, source
    union all
    select node_id, 'safety'::text as kind, count(*)::int as c from chunk_rows where is_safety group by node_id
    union all
    select l.node_id, 'pubmed'::text as kind, count(*)::int as c
    from pubmed_article_kg_node l
    join pubmed_evidence_chunk pec on pec.pmid = l.pmid
    where l.node_id in (select id from matched)
    group by l.node_id
  ),
  node_chunks as (
    select node_id, jsonb_object_agg(kind, c) as chunks from counts group by node_id
  ),
  enriched as (
    select
      m.id, m.type, m.source, m.canonical_name, m.moiety,
      coalesce(d.degree, 0) as degree,
      coalesce(nc.chunks, '{}'::jsonb) as chunks
    from matched m
    left join degree_b d on d.node_id = m.id
    left join node_chunks nc on nc.node_id = m.id
  ),
  grouped as (
    select
      moiety,
      count(*) as total,
      count(*) filter (where type = 'ingredient') as n_ingredient,
      count(*) filter (where type = 'drug_class') as n_class,
      count(*) filter (where type = 'drug') as n_product,
      count(distinct source) as n_sources,
      coalesce(jsonb_agg(distinct source), '[]'::jsonb) as sources,
      coalesce(sum(degree), 0) as total_degree,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', canonical_name, 'type', type,
        'source', source, 'degree', degree, 'chunks', chunks
      )), '[]'::jsonb) as members
    from enriched
    group by moiety
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.total desc), '[]'::jsonb)
  into v_result
  from grouped g;

  return v_result;
end;
$$;

revoke all on function kg_explorer_search(text, text, int, text[]) from public;
revoke all on function kg_explorer_search_grouped(text, text, int, text[]) from public;
grant execute on function kg_explorer_search(text, text, int, text[]) to anon, authenticated;
grant execute on function kg_explorer_search_grouped(text, text, int, text[]) to anon, authenticated;
