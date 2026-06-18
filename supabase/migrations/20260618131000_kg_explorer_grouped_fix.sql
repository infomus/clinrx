-- Fix kg_explorer_search_grouped: the `name ilike OR synonym-exists` predicate
-- defeated the trgm indexes and seq-scanned 168k nodes (statement timeout).
-- Replace with an indexed UNION of the two trgm-backed lookups.

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
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree
    from kg_node n
    join matched_ids m on m.id = n.id
    limit 2000
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
        'source', source, 'degree', degree
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
