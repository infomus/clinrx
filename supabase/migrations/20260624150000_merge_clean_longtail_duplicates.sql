-- Step 1 of the spine consolidation finish: merge the CLEAN long-tail duplicate
-- ingredient clusters (every duplicate moiety not previously interaction-bearing),
-- using the same name-primary / ATC-guardrail method (minerals/vitamins/inorganic
-- umbrellas deferred, combinations excluded). Map built by
-- scripts/build-interaction-merge-map.mjs (SCOPE=all) into kg_ingredient_merge_map.
-- Re-homing body is identical to 20260624140000.
set statement_timeout = 0;


-- Synonyms: keep loser names + existing loser synonyms on the canonical.
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

-- Edges: re-point endpoints, drop self-loops, dedup duplicates around canonicals.
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

-- Chunks (no unique on node_id).
update kg_chunk c set node_id = m.canonical_id
from kg_ingredient_merge_map m where c.node_id = m.node_id;

-- PubMed article links (PK pmid,node_id,source): copy to canonical, drop losers.
insert into pubmed_article_kg_node (pmid, node_id, source, concept_id, confidence, evidence_state, metadata)
select p.pmid, m.canonical_id, p.source, p.concept_id, p.confidence, p.evidence_state, p.metadata
from pubmed_article_kg_node p
join kg_ingredient_merge_map m on m.node_id = p.node_id
on conflict (pmid, node_id, source) do nothing;

delete from pubmed_article_kg_node p
using kg_ingredient_merge_map m where p.node_id = m.node_id;

-- Set-null / non-unique references: just re-point.
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

-- Preserve ATC: give a canonical that lacks ATC one from a loser that has it
-- (clusters with conflicting ATC-5 were excluded when the map was built).
update kg_node c
set identifiers = c.identifiers
  || jsonb_build_object('atc', l.atc, 'atc_origin', 'merge_preserved')
from (
  select distinct on (m.canonical_id) m.canonical_id, n.identifiers->'atc' as atc
  from kg_ingredient_merge_map m
  join kg_node n on n.id = m.node_id
  where n.identifiers ? 'atc'
) l
where c.id = l.canonical_id
  and not (c.identifiers ? 'atc');

-- Delete the loser nodes (loser-only crosswalk rows cascade away).
delete from kg_node where id in (select node_id from kg_ingredient_merge_map);
