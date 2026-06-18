-- Fix kg_explorer_node_chunks: kg_chunk has no created_at column (pubmed does),
-- which broke the UNION. Drop created_at from the unified select.

create or replace function kg_explorer_node_chunks(
  p_passcode text,
  p_node_id uuid,
  p_query text default null,
  p_kind text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  with mono as (
    select
      'monograph'::text as layer,
      source as kind,
      section as section,
      null::text as source_type,
      null::text as pmid,
      null::text as url,
      content
    from kg_chunk
    where node_id = p_node_id
  ),
  pm as (
    select
      'pubmed'::text as layer,
      'pubmed'::text as kind,
      section_title as section,
      source_type,
      pmid,
      source_url as url,
      content
    from pubmed_evidence_chunk
    where pmid in (
      select pmid from pubmed_article_kg_node where node_id = p_node_id
    )
  ),
  unified as (
    select * from mono
    union all
    select * from pm
  ),
  filtered as (
    select * from unified
    where (p_kind is null or kind = p_kind)
      and (
        v_query is null
        or content ilike '%' || v_query || '%'
        or coalesce(section, '') ilike '%' || v_query || '%'
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'chunks', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select layer, kind, section, source_type, pmid, url,
          left(content, 4000) as content
        from filtered
        order by kind asc, section asc nulls last
        limit least(greatest(coalesce(p_limit, 25), 1), 100)
        offset greatest(coalesce(p_offset, 0), 0)
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
