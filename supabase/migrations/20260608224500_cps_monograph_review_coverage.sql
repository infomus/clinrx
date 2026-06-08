create or replace function get_cps_monograph_coverage(node_ids uuid[])
returns table (
  node_id uuid,
  direct_monograph_count integer,
  linked_monograph_count integer,
  product_listing_count integer,
  total_chunk_count integer,
  monograph_examples jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with input_nodes as (
    select distinct unnest(node_ids) as node_id
  ),
  product_candidates as (
    select
      input_nodes.node_id,
      product_node.id as product_node_id,
      product_node.canonical_name as product_name,
      product_node.identifiers,
      'direct'::text as match_kind,
      lower(regexp_replace(product_node.canonical_name, '[^a-zA-Z0-9]+', '', 'g')) as normalized_name,
      lower(
        regexp_replace(
          regexp_replace(
            product_node.canonical_name,
            '[[:space:]]*(-[[:space:]]*)?[0-9]+[[:space:]]*(MG|MCG|G|ML|HR).*$',
            '',
            'i'
          ),
          '[^a-zA-Z0-9]+',
          '',
          'g'
        )
      ) as normalized_base_name
    from input_nodes
    join kg_node product_node
      on product_node.id = input_nodes.node_id
    where product_node.source = 'CPS'
      and product_node.type = 'drug'

    union

    select
      input_nodes.node_id,
      product_node.id as product_node_id,
      product_node.canonical_name as product_name,
      product_node.identifiers,
      'linked'::text as match_kind,
      lower(regexp_replace(product_node.canonical_name, '[^a-zA-Z0-9]+', '', 'g')) as normalized_name,
      lower(
        regexp_replace(
          regexp_replace(
            product_node.canonical_name,
            '[[:space:]]*(-[[:space:]]*)?[0-9]+[[:space:]]*(MG|MCG|G|ML|HR).*$',
            '',
            'i'
          ),
          '[^a-zA-Z0-9]+',
          '',
          'g'
        )
      ) as normalized_base_name
    from input_nodes
    join kg_edge edge
      on edge.target_id = input_nodes.node_id
    join kg_node product_node
      on product_node.id = edge.source_id
    where edge.source = 'CPS'
      and edge.relation = 'has_ingredient'
      and product_node.source = 'CPS'
      and product_node.type = 'drug'
  ),
  product_listing_counts as (
    select
      node_id,
      count(distinct product_node_id)::integer as product_listing_count
    from product_candidates
    where identifiers ->> 'caas_type' = 'MONOGRAPH_DPD'
    group by node_id
  ),
  cps_monographs as (
    select
      monograph_node.id as monograph_node_id,
      monograph_node.canonical_name,
      monograph_node.identifiers,
      lower(regexp_replace(monograph_node.canonical_name, '[^a-zA-Z0-9]+', '', 'g')) as normalized_name,
      count(chunk.id)::integer as chunk_count
    from kg_node monograph_node
    left join kg_chunk chunk
      on chunk.node_id = monograph_node.id
     and chunk.source = 'CPS'
    where monograph_node.source = 'CPS'
      and monograph_node.type = 'drug'
      and monograph_node.identifiers ->> 'caas_type' = 'MONOGRAPH'
      and monograph_node.identifiers ? 'cps_id'
    group by monograph_node.id, monograph_node.canonical_name, monograph_node.identifiers
  ),
  monograph_matches as (
    select
      product_candidates.node_id,
      cps_monographs.monograph_node_id,
      cps_monographs.canonical_name,
      cps_monographs.identifiers,
      cps_monographs.chunk_count,
      product_candidates.match_kind,
      product_candidates.product_name
    from product_candidates
    join cps_monographs
      on (
        product_candidates.identifiers ->> 'caas_type' = 'MONOGRAPH'
        and cps_monographs.monograph_node_id = product_candidates.product_node_id
      )
      or (
        product_candidates.identifiers ->> 'caas_type' = 'MONOGRAPH_DPD'
        and (
          cps_monographs.normalized_name = product_candidates.normalized_name
          or cps_monographs.normalized_name = product_candidates.normalized_base_name
        )
      )
  ),
  grouped_monograph_matches as (
    select
      monograph_matches.node_id,
      monograph_matches.monograph_node_id,
      monograph_matches.canonical_name,
      monograph_matches.identifiers,
      max(monograph_matches.chunk_count)::integer as chunk_count,
      bool_or(monograph_matches.match_kind = 'direct') as has_direct_match,
      bool_or(monograph_matches.match_kind = 'linked') as has_linked_match,
      jsonb_agg(distinct monograph_matches.product_name) as product_names
    from monograph_matches
    group by
      monograph_matches.node_id,
      monograph_matches.monograph_node_id,
      monograph_matches.canonical_name,
      monograph_matches.identifiers
  ),
  ranked_examples as (
    select
      grouped_monograph_matches.*,
      row_number() over (
        partition by grouped_monograph_matches.node_id
        order by grouped_monograph_matches.chunk_count desc, grouped_monograph_matches.canonical_name asc
      ) as rank
    from grouped_monograph_matches
  ),
  monograph_examples as (
    select
      ranked_examples.node_id,
      jsonb_agg(
        jsonb_build_object(
          'nodeId', ranked_examples.monograph_node_id,
          'name', ranked_examples.canonical_name,
          'cpsId', ranked_examples.identifiers ->> 'cps_id',
          'matchKind', case when ranked_examples.has_direct_match then 'direct' else 'linked' end,
          'productNames', ranked_examples.product_names,
          'chunkCount', ranked_examples.chunk_count
        )
        order by ranked_examples.chunk_count desc, ranked_examples.canonical_name asc
      ) as monograph_examples
    from ranked_examples
    where ranked_examples.rank <= 5
    group by ranked_examples.node_id
  )
  select
    input_nodes.node_id,
    coalesce(count(grouped_monograph_matches.monograph_node_id) filter (where grouped_monograph_matches.has_direct_match), 0)::integer as direct_monograph_count,
    coalesce(count(grouped_monograph_matches.monograph_node_id) filter (where grouped_monograph_matches.has_linked_match), 0)::integer as linked_monograph_count,
    coalesce(product_listing_counts.product_listing_count, 0) as product_listing_count,
    coalesce(sum(grouped_monograph_matches.chunk_count), 0)::integer as total_chunk_count,
    coalesce(monograph_examples.monograph_examples, '[]'::jsonb) as monograph_examples
  from input_nodes
  left join grouped_monograph_matches
    on grouped_monograph_matches.node_id = input_nodes.node_id
  left join product_listing_counts
    on product_listing_counts.node_id = input_nodes.node_id
  left join monograph_examples
    on monograph_examples.node_id = input_nodes.node_id
  group by
    input_nodes.node_id,
    product_listing_counts.product_listing_count,
    monograph_examples.monograph_examples;
$$;

grant execute on function get_cps_monograph_coverage(uuid[]) to anon;
grant execute on function get_cps_monograph_coverage(uuid[]) to authenticated;
grant execute on function get_cps_monograph_coverage(uuid[]) to service_role;
