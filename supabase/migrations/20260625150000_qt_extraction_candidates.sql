-- Candidate substances for the QT-prolongation PD layer: ingredient nodes whose
-- monograph (canonical chunk via product -> has_ingredient) or PubMed evidence
-- mentions QT prolongation / torsade. The substance is the unit; the extractor
-- maps drug names found in the text, so this just scopes which substances have
-- QT evidence to read. Read-only; statement_timeout=0 for the regex scan.
set statement_timeout = 0;

create table if not exists qt_extraction_candidate (
  node_id uuid primary key,
  source_kinds text[]
);

insert into qt_extraction_candidate (node_id, source_kinds)
select node_id, array_agg(distinct kind)
from (
  select hi.target_id as node_id, 'monograph' as kind
  from kg_chunk c
  join kg_edge hi on hi.source_id = c.node_id and hi.relation = 'has_ingredient'
  join kg_node n on n.id = hi.target_id and n.type = 'ingredient'
  where c.is_canonical
    and c.content ~* '(torsade|qtc|qt interval|qt[ -]?prolong|prolong[a-z]* .{0,15}qt)'
  union
  select an.node_id, 'pubmed' as kind
  from pubmed_evidence_chunk ec
  join pubmed_article_kg_node an on an.pmid = ec.pmid
  join kg_node n on n.id = an.node_id and n.type = 'ingredient'
  where ec.content ~* '(torsade|qtc|qt interval|qt[ -]?prolong|prolong[a-z]* .{0,15}qt)'
) s
group by node_id
on conflict (node_id) do nothing;

grant select on table qt_extraction_candidate to service_role;
