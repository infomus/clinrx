-- Knowledge-graph explorer RPCs for the internal pharmacist tool.
--
-- The KG (kg_node / kg_edge / ...) is server-only (CPS-derived content), so the
-- anon reviewer cannot read it directly. These SECURITY DEFINER functions expose
-- only controlled, search-first query shapes (node search, node detail, and a
-- filtered, paginated neighbourhood) and are gated by the same shared review
-- passcode used by the calibration tool. They never return embeddings.
--
-- This matches the existing review posture (client password gate + narrow data
-- access); it is not a substitute for real auth. Harden by switching the gate to
-- Supabase Auth if/when the tool needs it.

create or replace function kg_explorer_check_passcode(p_passcode text)
returns void
language plpgsql
immutable
as $$
begin
  if p_passcode is distinct from 'Ilovelayla123!' then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end;
$$;

-- Stable severity ordering (most severe first) for sorting edges.
create or replace function kg_explorer_severity_rank(p_severity interaction_severity)
returns int
language sql
immutable
as $$
  select case p_severity
    when 'contraindicated' then 0
    when 'major' then 1
    when 'moderate' then 2
    when 'minor' then 3
    else 4
  end;
$$;

-- 1) Search nodes by canonical name or synonym (trgm-backed).
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
      n.id,
      n.type,
      n.canonical_name,
      n.source,
      n.identifiers,
      n.summary,
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree
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

-- 2) Node detail: identity, synonyms, source crosswalk, chunk count, degree.
create or replace function kg_explorer_node(
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

  select jsonb_build_object(
    'id', n.id,
    'type', n.type,
    'canonical_name', n.canonical_name,
    'identifiers', n.identifiers,
    'summary', n.summary,
    'source', n.source,
    'created_at', n.created_at,
    'degree', (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id),
    'chunk_count', (select count(*) from kg_chunk k where k.node_id = n.id),
    'synonyms', (
      select coalesce(jsonb_agg(jsonb_build_object('synonym', s.synonym, 'source', s.source) order by s.synonym), '[]'::jsonb)
      from kg_node_synonym s where s.node_id = n.id
    ),
    'crosswalk', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'source_a', c.source_a, 'source_a_node_id', c.source_a_node_id,
        'source_b', c.source_b, 'source_b_node_id', c.source_b_node_id,
        'match_status', c.match_status, 'match_type', c.match_type,
        'confidence', c.confidence, 'conflicts', c.conflicts
      )), '[]'::jsonb)
      from kg_source_crosswalk c
      where c.source_a_node_id = n.id or c.source_b_node_id = n.id
    )
  ) into v_result
  from kg_node n
  where n.id = p_node_id;

  return v_result; -- null if not found
end;
$$;

-- 3) Neighbourhood: edges incident to a node (both directions), joined to the
-- neighbour node, with optional filters and pagination. Returns { total, edges }.
create or replace function kg_explorer_edges(
  p_passcode text,
  p_node_id uuid,
  p_relation kg_relation default null,
  p_severities text[] default null,
  p_statuses text[] default null,
  p_min_confidence real default null,
  p_neighbor_query text default null,
  p_limit int default 50,
  p_offset int default 0
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

  with incident as (
    select
      e.id, e.relation, e.severity, e.evidence_level, e.extraction_confidence,
      e.review_status, e.citations, e.source, e.created_at,
      case when e.source_id = p_node_id then 'out' else 'in' end as direction,
      case when e.source_id = p_node_id then e.target_id else e.source_id end as neighbor_id
    from kg_edge e
    where (e.source_id = p_node_id or e.target_id = p_node_id)
      and (p_relation is null or e.relation = p_relation)
      and (p_severities is null or e.severity::text = any (p_severities))
      and (p_statuses is null or e.review_status::text = any (p_statuses))
      and (p_min_confidence is null or e.extraction_confidence >= p_min_confidence)
  ),
  joined as (
    select i.*, n.canonical_name as neighbor_name, n.type as neighbor_type,
      n.source as neighbor_source
    from incident i
    join kg_node n on n.id = i.neighbor_id
    where p_neighbor_query is null
       or n.canonical_name ilike '%' || btrim(p_neighbor_query) || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from joined),
    'edges', coalesce((
      select jsonb_agg(to_jsonb(page))
      from (
        select
          id, direction, neighbor_id, neighbor_name, neighbor_type, neighbor_source,
          relation, severity, evidence_level, extraction_confidence,
          review_status, citations, source, created_at
        from joined
        order by kg_explorer_severity_rank(severity),
          extraction_confidence desc nulls last,
          neighbor_name asc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0)
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function kg_explorer_search(text, text, int) from public;
revoke all on function kg_explorer_node(text, uuid) from public;
revoke all on function kg_explorer_edges(text, uuid, kg_relation, text[], text[], real, text, int, int) from public;

grant execute on function kg_explorer_search(text, text, int) to anon, authenticated;
grant execute on function kg_explorer_node(text, uuid) to anon, authenticated;
grant execute on function kg_explorer_edges(text, uuid, kg_relation, text[], text[], real, text, int, int) to anon, authenticated;
