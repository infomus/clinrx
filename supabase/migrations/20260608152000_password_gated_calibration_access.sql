alter table pubmed_calibration_review
  alter column reviewer_id drop not null,
  add column if not exists reviewer_key text;

update pubmed_calibration_review
set reviewer_key = coalesce(reviewer_key, reviewer_id::text, 'shared-password-reviewer')
where reviewer_key is null;

alter table pubmed_calibration_review
  alter column reviewer_key set not null,
  alter column reviewer_key set default 'shared-password-reviewer';

alter table pubmed_calibration_review
  drop constraint if exists pubmed_calibration_review_set_id_candidate_id_reviewer_id_key;

create unique index if not exists pubmed_calibration_review_set_candidate_reviewer_key_idx
  on pubmed_calibration_review (set_id, candidate_id, reviewer_key);

grant select on table pubmed_interaction_candidate to anon;
grant select on table kg_node to anon;
grant select on table kg_source_crosswalk to anon;
grant execute on function get_health_canada_monograph_coverage(uuid[]) to anon;
grant select, insert, update on table pubmed_calibration_review to anon;

drop policy if exists "Anon can read fixed calibration candidates"
  on pubmed_interaction_candidate;
create policy "Anon can read fixed calibration candidates"
  on pubmed_interaction_candidate
  for select to anon
  using (
    id in (
      '49258098-3567-4b2b-878d-9ccf3255da1c',
      '152178b4-b53e-4bdd-97f9-fb2ce3f5bfd3',
      '26e72662-e025-4184-bffe-0ea75bb9da7e',
      'c6a6f740-c042-46e2-8e42-9ebec49ca504',
      'e0a0dda1-11d7-4e7f-88d9-b5161c977adc',
      '34662e98-b8c2-486b-aea4-51394bcb4cda',
      '6f71a5cf-71c5-4af0-a57a-2f65b3eaec3c',
      'beb77213-9d9a-4e0d-bccb-850b404f828e',
      'f8e33e12-02b1-47c9-8167-a1fa0ab7dc08',
      '2b1e99aa-c3e7-4887-ab0d-38c0dbf98037',
      'd9580888-fc05-4b7b-8d65-4013d2d737b7',
      '9e546bea-b494-4efb-b3d5-e16d33bcab40',
      '8d10a8cd-bfa9-4508-9c5b-637b304febdf',
      'f6b5b9da-141a-4065-8799-93da525863e2',
      'b569b2f1-2afb-4b57-acab-ae559c4f69d7',
      'a3924f4f-47ba-470a-b6fa-d00e4fefaf63',
      '3e40e166-e12b-4093-a67e-9ffed3ec1050',
      '5a97ca57-57c8-4840-98ac-9589ca91b8be',
      'c5a4d145-40a1-4a96-aa27-5d7243dcf9be',
      'e7536c03-ecf5-4f28-a96a-45cb40aa15b4',
      'fa90d8c6-eb92-45c8-b3b0-19025a5d2578',
      '9b57f5ce-4752-49fb-8e5f-6f62fe4aa4e5',
      '4783e188-26cc-420b-8c74-7bc5a41be642',
      '600a764b-fdb2-47de-9b75-ee50f81a976a',
      'de8bbf6f-c836-4b04-9671-4ca06616558c',
      '63639532-4e2f-4595-8e5c-e0b515c48abe',
      '729d7191-6b82-4442-a8f0-29f340a6a746',
      'd3af6a6f-173e-4870-a1c8-6f9196adedec',
      'feb731df-bdca-476e-8b9b-8cfd4de2d8ae',
      'c364d699-3a9e-4ece-8b08-84f0e6fbc450',
      'acc18c9c-2dda-4e4f-9a83-5c5c35446069',
      'c4ce9ebb-78f2-4b64-a028-52d306edc271',
      'b2d74b2b-6817-4bb7-8e02-a6e4149e8ebd',
      'dcbc2c6b-c47c-4bec-a6a4-11ce46478b0e',
      'acaeac2b-45e7-4ce3-9d80-badb5f945efc',
      '648c61db-8027-413f-849a-4c38f1a4296f',
      'ee66f530-a27e-4396-8297-abcedfc40d01',
      'a6dc63a7-612e-46e0-aaf5-c7ba3e045ad2',
      '13095dc9-6188-4fc3-bd1a-10dba5dfe033',
      '81bf672d-f491-464f-865e-266e2d66842c',
      '50330854-ebcd-4924-8bd7-76a876fe06c6',
      '0c67c6ee-b5de-4827-9757-270f7a9d49f1',
      'e4d306bb-c245-4a8c-bfa1-535115d9214e',
      'd5631342-78f1-49c5-9354-12c39050a35d',
      '321cbbef-e323-4a10-af80-608ca15f544b',
      '510e7b38-9129-4c3c-aae6-22750e7c2d85',
      'cb03ca44-7312-47a3-a2f5-730a8de50cf3',
      '8f367ca2-0bba-463d-b8b2-053cc651431e',
      'e978d19d-9439-4788-8c0c-ca890e317215',
      '965bfdc9-5480-49b0-8247-905f34e2a2be'
    )
  );

drop policy if exists "Anon can read fixed calibration nodes" on kg_node;
create policy "Anon can read fixed calibration nodes"
  on kg_node
  for select to anon
  using (
    exists (
      select 1
      from pubmed_interaction_candidate candidate
      where candidate.id in (
        '49258098-3567-4b2b-878d-9ccf3255da1c',
        '152178b4-b53e-4bdd-97f9-fb2ce3f5bfd3',
        '26e72662-e025-4184-bffe-0ea75bb9da7e',
        'c6a6f740-c042-46e2-8e42-9ebec49ca504',
        'e0a0dda1-11d7-4e7f-88d9-b5161c977adc',
        '34662e98-b8c2-486b-aea4-51394bcb4cda',
        '6f71a5cf-71c5-4af0-a57a-2f65b3eaec3c',
        'beb77213-9d9a-4e0d-bccb-850b404f828e',
        'f8e33e12-02b1-47c9-8167-a1fa0ab7dc08',
        '2b1e99aa-c3e7-4887-ab0d-38c0dbf98037',
        'd9580888-fc05-4b7b-8d65-4013d2d737b7',
        '9e546bea-b494-4efb-b3d5-e16d33bcab40',
        '8d10a8cd-bfa9-4508-9c5b-637b304febdf',
        'f6b5b9da-141a-4065-8799-93da525863e2',
        'b569b2f1-2afb-4b57-acab-ae559c4f69d7',
        'a3924f4f-47ba-470a-b6fa-d00e4fefaf63',
        '3e40e166-e12b-4093-a67e-9ffed3ec1050',
        '5a97ca57-57c8-4840-98ac-9589ca91b8be',
        'c5a4d145-40a1-4a96-aa27-5d7243dcf9be',
        'e7536c03-ecf5-4f28-a96a-45cb40aa15b4',
        'fa90d8c6-eb92-45c8-b3b0-19025a5d2578',
        '9b57f5ce-4752-49fb-8e5f-6f62fe4aa4e5',
        '4783e188-26cc-420b-8c74-7bc5a41be642',
        '600a764b-fdb2-47de-9b75-ee50f81a976a',
        'de8bbf6f-c836-4b04-9671-4ca06616558c',
        '63639532-4e2f-4595-8e5c-e0b515c48abe',
        '729d7191-6b82-4442-a8f0-29f340a6a746',
        'd3af6a6f-173e-4870-a1c8-6f9196adedec',
        'feb731df-bdca-476e-8b9b-8cfd4de2d8ae',
        'c364d699-3a9e-4ece-8b08-84f0e6fbc450',
        'acc18c9c-2dda-4e4f-9a83-5c5c35446069',
        'c4ce9ebb-78f2-4b64-a028-52d306edc271',
        'b2d74b2b-6817-4bb7-8e02-a6e4149e8ebd',
        'dcbc2c6b-c47c-4bec-a6a4-11ce46478b0e',
        'acaeac2b-45e7-4ce3-9d80-badb5f945efc',
        '648c61db-8027-413f-849a-4c38f1a4296f',
        'ee66f530-a27e-4396-8297-abcedfc40d01',
        'a6dc63a7-612e-46e0-aaf5-c7ba3e045ad2',
        '13095dc9-6188-4fc3-bd1a-10dba5dfe033',
        '81bf672d-f491-464f-865e-266e2d66842c',
        '50330854-ebcd-4924-8bd7-76a876fe06c6',
        '0c67c6ee-b5de-4827-9757-270f7a9d49f1',
        'e4d306bb-c245-4a8c-bfa1-535115d9214e',
        'd5631342-78f1-49c5-9354-12c39050a35d',
        '321cbbef-e323-4a10-af80-608ca15f544b',
        '510e7b38-9129-4c3c-aae6-22750e7c2d85',
        'cb03ca44-7312-47a3-a2f5-730a8de50cf3',
        '8f367ca2-0bba-463d-b8b2-053cc651431e',
        'e978d19d-9439-4788-8c0c-ca890e317215',
        '965bfdc9-5480-49b0-8247-905f34e2a2be'
      )
      and kg_node.id in (candidate.resolved_source_id, candidate.resolved_target_id)
    )
  );

drop policy if exists "Anon can read calibration crosswalk rows" on kg_source_crosswalk;
create policy "Anon can read calibration crosswalk rows"
  on kg_source_crosswalk
  for select to anon
  using (
    exists (
      select 1
      from pubmed_interaction_candidate candidate
      where candidate.id in (
        '49258098-3567-4b2b-878d-9ccf3255da1c',
        '152178b4-b53e-4bdd-97f9-fb2ce3f5bfd3',
        '26e72662-e025-4184-bffe-0ea75bb9da7e',
        'c6a6f740-c042-46e2-8e42-9ebec49ca504',
        'e0a0dda1-11d7-4e7f-88d9-b5161c977adc',
        '34662e98-b8c2-486b-aea4-51394bcb4cda',
        '6f71a5cf-71c5-4af0-a57a-2f65b3eaec3c',
        'beb77213-9d9a-4e0d-bccb-850b404f828e',
        'f8e33e12-02b1-47c9-8167-a1fa0ab7dc08',
        '2b1e99aa-c3e7-4887-ab0d-38c0dbf98037',
        'd9580888-fc05-4b7b-8d65-4013d2d737b7',
        '9e546bea-b494-4efb-b3d5-e16d33bcab40',
        '8d10a8cd-bfa9-4508-9c5b-637b304febdf',
        'f6b5b9da-141a-4065-8799-93da525863e2',
        'b569b2f1-2afb-4b57-acab-ae559c4f69d7',
        'a3924f4f-47ba-470a-b6fa-d00e4fefaf63',
        '3e40e166-e12b-4093-a67e-9ffed3ec1050',
        '5a97ca57-57c8-4840-98ac-9589ca91b8be',
        'c5a4d145-40a1-4a96-aa27-5d7243dcf9be',
        'e7536c03-ecf5-4f28-a96a-45cb40aa15b4',
        'fa90d8c6-eb92-45c8-b3b0-19025a5d2578',
        '9b57f5ce-4752-49fb-8e5f-6f62fe4aa4e5',
        '4783e188-26cc-420b-8c74-7bc5a41be642',
        '600a764b-fdb2-47de-9b75-ee50f81a976a',
        'de8bbf6f-c836-4b04-9671-4ca06616558c',
        '63639532-4e2f-4595-8e5c-e0b515c48abe',
        '729d7191-6b82-4442-a8f0-29f340a6a746',
        'd3af6a6f-173e-4870-a1c8-6f9196adedec',
        'feb731df-bdca-476e-8b9b-8cfd4de2d8ae',
        'c364d699-3a9e-4ece-8b08-84f0e6fbc450',
        'acc18c9c-2dda-4e4f-9a83-5c5c35446069',
        'c4ce9ebb-78f2-4b64-a028-52d306edc271',
        'b2d74b2b-6817-4bb7-8e02-a6e4149e8ebd',
        'dcbc2c6b-c47c-4bec-a6a4-11ce46478b0e',
        'acaeac2b-45e7-4ce3-9d80-badb5f945efc',
        '648c61db-8027-413f-849a-4c38f1a4296f',
        'ee66f530-a27e-4396-8297-abcedfc40d01',
        'a6dc63a7-612e-46e0-aaf5-c7ba3e045ad2',
        '13095dc9-6188-4fc3-bd1a-10dba5dfe033',
        '81bf672d-f491-464f-865e-266e2d66842c',
        '50330854-ebcd-4924-8bd7-76a876fe06c6',
        '0c67c6ee-b5de-4827-9757-270f7a9d49f1',
        'e4d306bb-c245-4a8c-bfa1-535115d9214e',
        'd5631342-78f1-49c5-9354-12c39050a35d',
        '321cbbef-e323-4a10-af80-608ca15f544b',
        '510e7b38-9129-4c3c-aae6-22750e7c2d85',
        'cb03ca44-7312-47a3-a2f5-730a8de50cf3',
        '8f367ca2-0bba-463d-b8b2-053cc651431e',
        'e978d19d-9439-4788-8c0c-ca890e317215',
        '965bfdc9-5480-49b0-8247-905f34e2a2be'
      )
      and (
        kg_source_crosswalk.source_a_node_id in (candidate.resolved_source_id, candidate.resolved_target_id)
        or kg_source_crosswalk.source_b_node_id in (candidate.resolved_source_id, candidate.resolved_target_id)
      )
    )
  );

drop policy if exists "Anon can read shared calibration reviews"
  on pubmed_calibration_review;
create policy "Anon can read shared calibration reviews"
  on pubmed_calibration_review
  for select to anon
  using (set_id = 'pubmed-interaction-calibration-2026-06-08');

drop policy if exists "Anon can insert shared calibration reviews"
  on pubmed_calibration_review;
create policy "Anon can insert shared calibration reviews"
  on pubmed_calibration_review
  for insert to anon
  with check (
    set_id = 'pubmed-interaction-calibration-2026-06-08'
    and reviewer_key = 'shared-password-reviewer'
  );

drop policy if exists "Anon can update shared calibration reviews"
  on pubmed_calibration_review;
create policy "Anon can update shared calibration reviews"
  on pubmed_calibration_review
  for update to anon
  using (
    set_id = 'pubmed-interaction-calibration-2026-06-08'
    and reviewer_key = 'shared-password-reviewer'
  )
  with check (
    set_id = 'pubmed-interaction-calibration-2026-06-08'
    and reviewer_key = 'shared-password-reviewer'
  );
