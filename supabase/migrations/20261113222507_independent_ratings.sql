-- Preserve the current authorization, idempotency and version checks. Remove only
-- the watch prerequisite from the existing private implementation.
do $migration$
declare definition text; changed text;
begin
 select pg_get_functiondef('mv_private.apply_core(uuid,text,text,jsonb,bigint)'::regprocedure) into definition;
 changed:=regexp_replace(definition, E'  if p_payload->>''score'' is not null and not \\(exists[^\\n]+WATCH_FIRST[^\\n]+\\n', '');
 if changed=definition then raise exception 'Expected WATCH_FIRST guard was not found';end if;
 execute changed;
end
$migration$;
