-- Add per-node chunk breakdown ({kind: count}) to the explorer search results so
-- every node shows how many chunks of each source it has (CPS / HC monograph /
-- NOC / summary / PubMed). Indexed lookups (kg_chunk(source,node_id),
-- pubmed_article_kg_node(node_id), pubmed_evidence_chunk(pmid)).

create or replace function kg_node_chunk_breakdown(p_node_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with mono as (
    select source as kind, count(*)::int as c
    from kg_chunk where node_id = p_node_id group by source
  ),
  pm as (
    select 'pubmed'::text as kind, count(*)::int as c
    from pubmed_evidence_chunk
    where pmid in (select pmid from pubmed_article_kg_node where node_id = p_node_id)
  ),
  combined as (
    select kind, c from mono
    union all
    select kind, c from pm where c > 0
  )
  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) from combined;
$$;

-- Flat search: include chunk breakdown per node.
create or replace function kg_explorer_search(
  p_passcode text,
  p_query text,
  p_limit int default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);
  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_result
  from (
    select
      n.id, n.type, n.canonical_name, n.source, n.identifiers, n.summary,
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree,
      kg_node_chunk_breakdown(n.id) as chunks
    from kg_node n
    where n.canonical_name ilike '%' || v_query || '%'
       or exists (
         select 1 from kg_node_synonym s
         where s.node_id = n.id and s.synonym ilike '%' || v_query || '%'
       )
    order by
      (lower(n.canonical_name) = lower(v_query)) desc,
      similarity(n.canonical_name, v_query) desc,
      length(n.canonical_name) asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) t;

  return v_result;
end;
$$;

-- Grouped search: include chunk breakdown per member.
create or replace function kg_explorer_search_grouped(
  p_passcode text,
  p_query text,
  p_limit int default 40
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
      kg_explorer_base_moiety(n.canonical_name) as moiety,
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree,
      kg_node_chunk_breakdown(n.id) as chunks
    from kg_node n
    join matched_ids m on m.id = n.id
    limit 1500
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
    from matched
    group by moiety
  )
  select coalesce(jsonb_agg(to_jsonb(g) order by g.total desc), '[]'::jsonb)
  into v_result
  from grouped g;

  return v_result;
end;
$$;
