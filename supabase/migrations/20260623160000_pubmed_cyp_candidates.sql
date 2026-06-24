-- Identify the PubMed extraction candidates for the PK (CYP) layer: articles
-- whose evidence text mentions a CYP isoenzyme AND that are linked to an
-- "emerging" ingredient node — one with NO existing CYP edge (the monograph pass
-- didn't cover it). The article (pmid) is the unit of LLM extraction; drug names
-- found in the text are mapped to ingredient nodes by the extractor, so this set
-- only scopes WHICH articles to read.
--
-- Read-only analysis (no graph changes). statement_timeout=0 because the content
-- regex scans ~130k evidence chunks; run in the background.
set statement_timeout = 0;

create table if not exists pubmed_cyp_extraction_candidate (
  pmid text not null,
  node_id uuid not null,
  primary key (pmid, node_id)
);

insert into pubmed_cyp_extraction_candidate (pmid, node_id)
select distinct ec.pmid, an.node_id
from pubmed_evidence_chunk ec
join pubmed_article_kg_node an on an.pmid = ec.pmid
join kg_node n on n.id = an.node_id and n.type = 'ingredient'
where ec.content ~* 'cyp[ -]?[0-9]'
  and not exists (
    select 1 from kg_edge e
    where e.source_id = an.node_id
      and e.relation in ('metabolized_by', 'inhibits_enzyme', 'induces_enzyme')
  )
on conflict do nothing;

grant select on table pubmed_cyp_extraction_candidate to service_role;
