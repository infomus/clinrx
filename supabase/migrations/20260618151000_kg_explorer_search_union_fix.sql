-- Flat kg_explorer_search still used the `name ilike OR synonym-exists` predicate,
-- which seq-scans 168k nodes (~3s). Switch to the indexed UNION like the grouped
-- search, keeping the per-node chunk breakdown.

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
    order by
      (lower(n.canonical_name) = lower(v_query)) desc,
      similarity(n.canonical_name, v_query) desc,
      length(n.canonical_name) asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) t;

  return v_result;
end;
$$;
