-- Lightweight typeahead for the explorer search bar: distinct canonical names
-- matching the query (with how many nodes share each name), fast (trgm index,
-- no joins/breakdown). Exact > prefix > substring ordering.

create or replace function kg_explorer_suggest(
  p_passcode text,
  p_query text,
  p_limit int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_result jsonb;
begin
  perform kg_explorer_check_passcode(p_passcode);
  if length(v_query) < 2 then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('name', name, 'count', c)
      order by ord, c desc, length(name), name),
    '[]'::jsonb
  ) into v_result
  from (
    select
      canonical_name as name,
      count(*)::int as c,
      case
        when lower(canonical_name) = lower(v_query) then 0
        when canonical_name ilike v_query || '%' then 1
        else 2
      end as ord
    from kg_node
    where canonical_name ilike '%' || v_query || '%'
    group by canonical_name
    order by ord asc, c desc, length(canonical_name) asc
    limit least(greatest(coalesce(p_limit, 10), 1), 20)
  ) s;

  return v_result;
end;
$$;

revoke all on function kg_explorer_suggest(text, text, int) from public;
grant execute on function kg_explorer_suggest(text, text, int) to anon, authenticated;
