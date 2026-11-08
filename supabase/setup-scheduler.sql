-- Run only on the selected Supabase project after provisioning mv_app_url and
-- mv_cron_secret in Vault and CRON_SECRET in the Edge Function's secrets.
-- No secret value is embedded in this SQL or in the stored cron command.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='mv_app_url') or not exists(select 1 from vault.decrypted_secrets where name='mv_cron_secret') then raise exception 'Provision the two Vault settings first';end if;
 if exists(select 1 from cron.job where jobname='our-marvel-dispatch') then perform cron.unschedule('our-marvel-dispatch');end if;
end$$;
select cron.schedule('our-marvel-dispatch','* * * * *',$job$
 select net.http_post(
 url:=(select decrypted_secret from vault.decrypted_secrets where name='mv_app_url' limit 1)||'/functions/v1/push-dispatch',
 headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='mv_cron_secret' limit 1),'Content-Type','application/json'),
 body:='{}'::jsonb,timeout_milliseconds:=55000
 );
$job$);
