-- Pharmacokinetic (CYP) layer schema: enzyme node type + drug->enzyme relations.
alter type kg_node_type add value if not exists 'enzyme';
alter type kg_relation add value if not exists 'inhibits_enzyme';
alter type kg_relation add value if not exists 'induces_enzyme';
alter type kg_relation add value if not exists 'metabolized_by';
