-- Propagate ATC-5 onto ingredient (moiety) nodes from their single-ingredient
-- products. ATC is captured natively on products (DPD/CPS) but only ~42% of
-- ingredient nodes carry it; the canonical-identity key for consolidation wants
-- ATC-5 at the moiety level. A single-ingredient product's ATC-5 IS its moiety's.
--
-- Conservative: only single-ingredient products; only well-formed ATC-5 codes
-- (1 letter, 2 digits, 2 letters, 2 digits); only write when there is an
-- UNAMBIGUOUS top code (no tie); never overwrite an existing ingredient ATC.
-- Idempotent (the "no existing atc" guard makes re-runs safe). Marked with
-- atc_origin='product_propagation' so it's distinguishable from native ATC.
set statement_timeout = 0;

with prod_ing as (
  select source_id as product_id, target_id as ingredient_id
  from kg_edge
  where relation = 'has_ingredient'
),
single_prod as (
  select product_id from prod_ing group by product_id having count(*) = 1
),
prod_atc as (
  select pi.ingredient_id, code
  from prod_ing pi
  join single_prod s on s.product_id = pi.product_id
  join kg_node p on p.id = pi.product_id and p.type = 'drug'
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(p.identifiers->'atc') = 'array' then p.identifiers->'atc'
      else jsonb_build_array(p.identifiers->'atc')
    end
  ) as code
  where p.identifiers ? 'atc'
    and code ~ '^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$'
),
cand as (
  select ingredient_id, code, count(*) as votes
  from prod_atc
  group by ingredient_id, code
),
maxv as (
  select ingredient_id, max(votes) as top_votes
  from cand
  group by ingredient_id
),
topcodes as (
  select c.ingredient_id, c.code
  from cand c
  join maxv m on m.ingredient_id = c.ingredient_id and c.votes = m.top_votes
),
winner as (
  -- only ingredients with a single unambiguous top code
  select ingredient_id, max(code) as code
  from topcodes
  group by ingredient_id
  having count(*) = 1
)
update kg_node n
set identifiers = n.identifiers
  || jsonb_build_object('atc', jsonb_build_array(w.code), 'atc_origin', 'product_propagation')
from winner w
where n.id = w.ingredient_id
  and n.type = 'ingredient'
  and not (n.identifiers ? 'atc');
