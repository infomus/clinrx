-- Add a "safety" overlay to the per-node chunk breakdown / stats: monograph
-- chunks whose section is a Warnings / Precautions / Contraindications section
-- (same rule the runtime uses for the safety fallback). It overlaps the source
-- counts (a CPS warnings chunk counts under both CPS and safety) — it is a
-- section overlay, not a separate source.

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
  safety as (
    select 'safety'::text as kind, count(*)::int as c
    from kg_chunk
    where node_id = p_node_id
      and (
        section ~* '(warning|precaution|contraindication)'
        or left(content, 200) ~* '(warning|precaution|contraindication)'
      )
  ),
  combined as (
    select kind, c from mono
    union all select kind, c from pm where c > 0
    union all select kind, c from safety where c > 0
  )
  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) from combined;
$$;

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
    from kg_chunk where node_id = p_node_id group by source
  ),
  pm as (
    select 'pubmed'::text as kind, count(*)::int as c
    from pubmed_evidence_chunk
    where pmid in (select pmid from pubmed_article_kg_node where node_id = p_node_id)
  ),
  safety as (
    select 'safety'::text as kind, count(*)::int as c
    from kg_chunk
    where node_id = p_node_id
      and (
        section ~* '(warning|precaution|contraindication)'
        or left(content, 200) ~* '(warning|precaution|contraindication)'
      )
  ),
  combined as (
    select kind, c from mono
    union all select kind, c from pm where c > 0
    union all select kind, c from safety where c > 0
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('kind', kind, 'count', c) order by c desc),
    '[]'::jsonb
  ) into v_result
  from combined;

  return v_result;
end;
$$;

-- Chunk list: support p_kind = 'safety' as a section filter (across monograph
-- chunks) rather than an exact source match.
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
    select 'monograph'::text as layer, source as kind, section as section,
      null::text as source_type, null::text as pmid, null::text as url, content
    from kg_chunk where node_id = p_node_id
  ),
  pm as (
    select 'pubmed'::text as layer, 'pubmed'::text as kind, section_title as section,
      source_type, pmid, source_url as url, content
    from pubmed_evidence_chunk
    where pmid in (select pmid from pubmed_article_kg_node where node_id = p_node_id)
  ),
  unified as (
    select * from mono
    union all
    select * from pm
  ),
  filtered as (
    select * from unified
    where (
        case
          when p_kind = 'safety' then (
            section ~* '(warning|precaution|contraindication)'
            or left(content, 200) ~* '(warning|precaution|contraindication)'
          )
          when p_kind is null then true
          else kind = p_kind
        end
      )
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
