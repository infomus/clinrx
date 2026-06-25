-- Staging + apply for the monograph chunk dedup pass. The dedup script computes
-- per-chunk assignments client-side (noise-stripping + near-duplicate clustering),
-- bulk-inserts them here, then calls apply_kg_chunk_dedup() to write them onto
-- kg_chunk in one server-side UPDATE (service-role only; internal admin tool).
create table if not exists kg_chunk_dedup_stage (
  chunk_id uuid primary key,
  dedup_group_id uuid,
  is_canonical boolean not null default true,
  dedup_substance_id uuid,
  dedup_product_count int
);
grant select, insert, update, delete on table kg_chunk_dedup_stage to service_role;

create or replace function apply_kg_chunk_dedup()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = 0
as $$
declare n int;
begin
  update kg_chunk c set
    dedup_group_id = s.dedup_group_id,
    is_canonical = s.is_canonical,
    dedup_substance_id = s.dedup_substance_id,
    dedup_product_count = s.dedup_product_count
  from kg_chunk_dedup_stage s
  where c.id = s.chunk_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function apply_kg_chunk_dedup() from public;
grant execute on function apply_kg_chunk_dedup() to service_role;
