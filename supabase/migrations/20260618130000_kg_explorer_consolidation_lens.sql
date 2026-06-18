-- Consolidation lens for the KG explorer: group nodes by base moiety so the
-- duplication/fragmentation is legible (per-search grouping + a global overview).
-- READ-ONLY query shapes; gated by the shared review passcode. No data changes.

-- Normalize a node name to its base moiety: uppercase, drop parentheticals and
-- punctuation, then strip trailing salt / ester / hydrate tokens (mirrors the
-- profiler). e.g. "Warfarin Sodium" -> "WARFARIN", "WARFARIN SODIUM DIHYDRATE" -> "WARFARIN".
create or replace function kg_explorer_base_moiety(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(coalesce(p_name, ''));
  tokens text[];
  salts text[] := array[
    'SODIUM','POTASSIUM','CALCIUM','MAGNESIUM','ZINC','LITHIUM',
    'HYDROCHLORIDE','HCL','DIHYDROCHLORIDE','HYDROBROMIDE','HBR','BROMIDE',
    'CHLORIDE','SULFATE','SULPHATE','BISULFATE','HEMISULFATE',
    'MESYLATE','MESILATE','MALEATE','TARTRATE','BITARTRATE','CITRATE',
    'PHOSPHATE','DIPHOSPHATE','ACETATE','SUCCINATE','FUMARATE','HEMIFUMARATE',
    'BESYLATE','BESILATE','NITRATE','OXALATE','PAMOATE','EMBONATE',
    'DECANOATE','ENANTHATE','PROPIONATE','VALERATE','DIPROPIONATE',
    'FUROATE','XINAFOATE','LACTATE','GLUCONATE','STEARATE','PALMITATE',
    'TOSYLATE','TOSILATE','EDISYLATE','ISETHIONATE','TEOCLATE','TEBUTATE',
    'MONOHYDRATE','DIHYDRATE','TRIHYDRATE','HEMIHYDRATE','SESQUIHYDRATE',
    'HYDRATE','ANHYDROUS','MONOHYDROCHLORIDE','AXETIL','PROXETIL',
    'DISODIUM','TRISODIUM','TROMETHAMINE','TROMETAMOL','MEGLUMINE',
    'ESYLATE','NAPSYLATE','POLISTIREX'
  ];
begin
  v := regexp_replace(v, '\(.*?\)', ' ', 'g');
  v := regexp_replace(v, '[^A-Z0-9 ]', ' ', 'g');
  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  if v = '' then
    return '';
  end if;
  tokens := string_to_array(v, ' ');
  while array_length(tokens, 1) > 1
    and tokens[array_length(tokens, 1)] = any (salts)
  loop
    tokens := tokens[1:array_length(tokens, 1) - 1];
  end loop;
  return array_to_string(tokens, ' ');
end;
$$;

-- Per-search grouping: matched nodes collapsed by base moiety, with type/source
-- breakdown and members, so one search shows the fragmentation for that drug.
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

  with matched as (
    select
      n.id, n.type, n.source, n.canonical_name,
      kg_explorer_base_moiety(n.canonical_name) as moiety,
      (select count(*) from kg_edge e where e.source_id = n.id or e.target_id = n.id) as degree
    from kg_node n
    where n.canonical_name ilike '%' || v_query || '%'
       or exists (
         select 1 from kg_node_synonym s
         where s.node_id = n.id and s.synonym ilike '%' || v_query || '%'
       )
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

-- Global overview: most-duplicated moieties across the interaction-bearing spine
-- (ingredient + drug_class), plus summary counts.
create or replace function kg_explorer_duplication(
  p_passcode text,
  p_limit int default 100
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

  with spine as (
    select id, type, source, kg_explorer_base_moiety(canonical_name) as moiety
    from kg_node
    where type in ('ingredient', 'drug_class')
  ),
  grp as (
    select
      moiety,
      count(*) as total,
      count(*) filter (where type = 'ingredient') as n_ingredient,
      count(*) filter (where type = 'drug_class') as n_class,
      count(distinct source) as n_sources,
      coalesce(jsonb_agg(distinct source), '[]'::jsonb) as sources
    from spine
    where moiety <> ''
    group by moiety
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'spine_nodes', (select count(*) from spine),
      'moieties', (select count(*) from grp),
      'duplicate_moieties', (select count(*) from grp where total > 1),
      'eliminable_nodes', (select coalesce(sum(total - 1), 0) from grp where total > 1)
    ),
    'top', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select moiety, total, n_ingredient, n_class, n_sources, sources
        from grp
        where total > 1
        order by total desc, moiety asc
        limit least(greatest(coalesce(p_limit, 100), 1), 300)
      ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function kg_explorer_search_grouped(text, text, int) from public;
revoke all on function kg_explorer_duplication(text, int) from public;
grant execute on function kg_explorer_search_grouped(text, text, int) to anon, authenticated;
grant execute on function kg_explorer_duplication(text, int) to anon, authenticated;
