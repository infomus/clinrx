-- A prior foreground bulk delete on kg_node was started with statement_timeout=0
-- and its client was killed mid-run; the server backend can keep running (holding
-- locks on kg_node/kg_chunk) until the dead connection is noticed. Terminate any
-- such leftover backend so the index + delete migrations below can proceed.
-- No-op if none are running. Touches no application tables (only pg_stat_activity).

do $$
declare
  r record;
begin
  for r in
    select pid
    from pg_stat_activity
    where pid <> pg_backend_pid()
      and state in ('active', 'idle in transaction')
      and (
        query ilike '%delete from kg_node%'
        or query ilike '%kg_noc_node_audit%'
      )
  loop
    perform pg_terminate_backend(r.pid);
  end loop;
end $$;
