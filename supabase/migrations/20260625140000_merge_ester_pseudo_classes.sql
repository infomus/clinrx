-- Ester pseudo-class cleanup: with esters added to the salt-strip, the remaining
-- substance-level drug_class "pseudo-classes" (mometasone, fluticasone,
-- clobetasol, ciclosporin, …) now match their ingredient. Merge each into its
-- ingredient; for multi-ATC substances (e.g. mometasone = nasal/inhaled/topical)
-- UNION all the ATC-5 codes onto the ingredient so its class memberships are kept.
-- Map (loser pseudo-class -> canonical ingredient) in kg_ingredient_merge_map.
set statement_timeout = 0;

insert into kg_node_synonym (node_id, synonym, source)
select m.canonical_id, m.loser_name, coalesce(m.loser_source, 'merge')
from kg_ingredient_merge_map m
where m.loser_name is not null
on conflict (node_id, synonym) do nothing;

insert into kg_node_synonym (node_id, synonym, source)
select m.canonical_id, s.synonym, s.source
from kg_node_synonym s
join kg_ingredient_merge_map m on m.node_id = s.node_id
on conflict (node_id, synonym) do nothing;

delete from kg_node_synonym s
using kg_ingredient_merge_map m where s.node_id = m.node_id;

update kg_edge e set source_id = m.canonical_id
from kg_ingredient_merge_map m where e.source_id = m.node_id;
update kg_edge e set target_id = m.canonical_id
from kg_ingredient_merge_map m where e.target_id = m.node_id;

delete from kg_edge
where source_id = target_id
  and source_id in (select canonical_id from kg_ingredient_merge_map);

delete from kg_edge a using kg_edge b
where a.id > b.id
  and a.source_id = b.source_id
  and a.target_id = b.target_id
  and a.relation = b.relation
  and (
    a.source_id in (select canonical_id from kg_ingredient_merge_map)
    or a.target_id in (select canonical_id from kg_ingredient_merge_map)
  );

update kg_chunk c set node_id = m.canonical_id
from kg_ingredient_merge_map m where c.node_id = m.node_id;

insert into pubmed_article_kg_node (pmid, node_id, source, concept_id, confidence, evidence_state, metadata)
select p.pmid, m.canonical_id, p.source, p.concept_id, p.confidence, p.evidence_state, p.metadata
from pubmed_article_kg_node p
join kg_ingredient_merge_map m on m.node_id = p.node_id
on conflict (pmid, node_id, source) do nothing;

delete from pubmed_article_kg_node p
using kg_ingredient_merge_map m where p.node_id = m.node_id;

update pubmed_interaction_candidate c set resolved_source_id = m.canonical_id
from kg_ingredient_merge_map m where c.resolved_source_id = m.node_id;
update pubmed_interaction_candidate c set resolved_target_id = m.canonical_id
from kg_ingredient_merge_map m where c.resolved_target_id = m.node_id;
update pubmed_node_search_concept c set primary_node_id = m.canonical_id
from kg_ingredient_merge_map m where c.primary_node_id = m.node_id;
update pubmed_node_search_result r set primary_node_id = m.canonical_id
from kg_ingredient_merge_map m where r.primary_node_id = m.node_id;
update interaction_evaluation_run x set resolved_source_id = m.canonical_id
from kg_ingredient_merge_map m where x.resolved_source_id = m.node_id;
update interaction_evaluation_run x set resolved_target_id = m.canonical_id
from kg_ingredient_merge_map m where x.resolved_target_id = m.node_id;

-- UNION all ATC-5 codes (existing ingredient + every merged pseudo-class) onto the ingredient.
with codes as (
  select m.canonical_id as ing_id, c.identifiers->>'atc_code' as code
  from kg_ingredient_merge_map m
  join kg_node c on c.id = m.node_id
  where c.identifiers ? 'atc_code'
  union
  select i.id, x
  from kg_node i
  join (select distinct canonical_id from kg_ingredient_merge_map) mm on mm.canonical_id = i.id
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(i.identifiers->'atc') = 'array' then i.identifiers->'atc'
         when i.identifiers ? 'atc' then jsonb_build_array(i.identifiers->'atc')
         else '[]'::jsonb end) x
),
agg as (
  select ing_id, jsonb_agg(distinct code order by code) as atc
  from codes where code is not null group by ing_id
)
update kg_node i
set identifiers = i.identifiers || jsonb_build_object('atc', a.atc, 'atc_origin', 'from_pseudo_class')
from agg a where i.id = a.ing_id;

delete from kg_node where id in (select node_id from kg_ingredient_merge_map);
