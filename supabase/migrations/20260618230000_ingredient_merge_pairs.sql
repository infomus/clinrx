-- READ-ONLY analysis for ingredient-moiety consolidation driven by MATCHED
-- crosswalk only. The matched crosswalk is ~99.6% product-level, so we propagate:
-- a matched (cross-source) pair of SINGLE-ingredient products implies their two
-- ingredient nodes are the same moiety. Also seed with any direct
-- ingredient<->ingredient matched rows. Produces normalized ingredient id pairs.
-- No graph changes.

create table if not exists kg_ingredient_merge_pairs (
  ia uuid not null,
  ib uuid not null,
  primary key (ia, ib)
);

insert into kg_ingredient_merge_pairs (ia, ib)
with prod_ing as (
  select source_id as product_id, target_id as ingredient_id
  from kg_edge where relation = 'has_ingredient'
),
single_ing_products as (
  select product_id from prod_ing group by product_id having count(*) = 1
),
p2i as (
  select pi.product_id, pi.ingredient_id
  from prod_ing pi
  join single_ing_products s on s.product_id = pi.product_id
  join kg_node ing on ing.id = pi.ingredient_id and ing.type = 'ingredient'
),
matched as (
  select source_a_node_id as a, source_b_node_id as b
  from kg_source_crosswalk where match_status = 'matched'
),
pairs as (
  select c.source_a_node_id as ia, c.source_b_node_id as ib
  from kg_source_crosswalk c
  join kg_node na on na.id = c.source_a_node_id and na.type = 'ingredient'
  join kg_node nb on nb.id = c.source_b_node_id and nb.type = 'ingredient'
  where c.match_status = 'matched'
  union
  select pa.ingredient_id, pb.ingredient_id
  from matched m
  join p2i pa on pa.product_id = m.a
  join p2i pb on pb.product_id = m.b
)
select least(ia, ib), greatest(ia, ib)
from pairs
where ia <> ib
on conflict do nothing;

grant select on table kg_ingredient_merge_pairs to service_role;
