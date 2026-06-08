create table if not exists pubmed_calibration_review (
  id uuid primary key default gen_random_uuid(),
  set_id text not null,
  candidate_id uuid not null references pubmed_interaction_candidate(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  interaction_assessment text check (
    interaction_assessment in ('real', 'not_interaction', 'unclear')
  ),
  drug_pair_assessment text check (
    drug_pair_assessment in ('correct', 'partially_correct', 'wrong_pair', 'unclear')
  ),
  resolution_assessment text check (
    resolution_assessment in ('correct', 'wrong_level', 'wrong_node', 'unresolved_unclear')
  ),
  severity_management_assessment text check (
    severity_management_assessment in ('acceptable', 'needs_revision', 'wrong', 'not_assessed')
  ),
  decision text check (
    decision in ('publishable', 'follow_up', 'reject')
  ),
  missing_context text[] not null default '{}',
  time_bucket text check (
    time_bucket in ('fast', 'medium', 'slow')
  ),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, candidate_id, reviewer_id)
);

create index if not exists pubmed_calibration_review_set_idx
  on pubmed_calibration_review (set_id, created_at desc);

create index if not exists pubmed_calibration_review_candidate_idx
  on pubmed_calibration_review (candidate_id);

alter table pubmed_calibration_review enable row level security;

drop policy if exists "Authenticated reviewers can read calibration reviews"
  on pubmed_calibration_review;
create policy "Authenticated reviewers can read calibration reviews"
  on pubmed_calibration_review
  for select to authenticated
  using (true);

drop policy if exists "Authenticated reviewers can insert own calibration reviews"
  on pubmed_calibration_review;
create policy "Authenticated reviewers can insert own calibration reviews"
  on pubmed_calibration_review
  for insert to authenticated
  with check (reviewer_id = auth.uid());

drop policy if exists "Authenticated reviewers can update own calibration reviews"
  on pubmed_calibration_review;
create policy "Authenticated reviewers can update own calibration reviews"
  on pubmed_calibration_review
  for update to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

drop trigger if exists pubmed_calibration_review_set_updated_at
  on pubmed_calibration_review;
create trigger pubmed_calibration_review_set_updated_at
  before update on pubmed_calibration_review
  for each row execute function set_updated_at();

grant select, insert, update on table pubmed_calibration_review to authenticated;
