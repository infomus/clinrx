-- KG explorer: per-node evidence chunks. Monograph chunks live in kg_chunk
-- (node_id); PubMed chunks live in pubmed_evidence_chunk, linked to a node by
-- pmid via pubmed_article_kg_node. These RPCs surface both, unified, with
-- per-source counts and a searchable/paginated chunk list. READ-ONLY; passcode-gated.

create or replace function kg_explorer_node_chunk_stats(
  p_passcode text,
  p_node_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);

  with mono as (
    select source as kind, count(*)::int as c
    from kg_chunk
    where node_id = p_node_id
    group by source
  ),
  pm as (
    select 'pubmed'::text as kind, count(*)::int as c
    from pubmed_evidence_chunk pec
    where pec.pmid in (
      select pmid from pubmed_article_kg_node where node_id = p_node_id
    )
  ),
  combined as (
    select kind, c from mono
    union all
    select kind, c from pm where c > 0
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('kind', kind, 'count', c) order by c desc),
    '[]'::jsonb
  ) into v_result
  from combined;

  return v_result;
end;
$$;

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
      content,
      created_at
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
      content,
      created_at
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

revoke all on function kg_explorer_node_chunk_stats(text, uuid) from public;
revoke all on function kg_explorer_node_chunks(text, uuid, text, text, int, int) from public;
grant execute on function kg_explorer_node_chunk_stats(text, uuid) to anon, authenticated;
grant execute on function kg_explorer_node_chunks(text, uuid, text, text, int, int) to anon, authenticated;
