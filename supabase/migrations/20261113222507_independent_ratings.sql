-- Preserve the current authorization, idempotency and version checks. Remove only
-- the watch prerequisite from the existing private implementation.
do $migration$
declare definition text; changed text;
begin
 select pg_get_functiondef('mv_private.apply_core(uuid,text,text,jsonb,bigint)'::regprocedure) into definition;
 changed:=regexp_replace(definition, E'  if p_payload->>''score'' is not null and not \\(exists[^\\n]+WATCH_FIRST[^\\n]+\\n', '');
 if changed=definition then raise exception 'Expected WATCH_FIRST guard was not found';end if;
 changed:=replace(changed, 'if (pr.section=''future'' or pr.release_date>current_date) and not(p_kind=''rating'' and p_payload->>''score'' is null and p_payload ? ''favorite'') then', 'if p_kind<>''rating'' and (pr.section=''future'' or pr.release_date>current_date) then');
 execute changed;
end
$migration$;
