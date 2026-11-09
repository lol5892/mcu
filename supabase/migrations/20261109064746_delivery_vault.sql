-- Service-only configuration bridge: browser roles have no access to Vault.
create or replace function public.mv_delivery_settings() returns jsonb
language sql security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(name,decrypted_secret),'{}'::jsonb)
 from vault.decrypted_secrets where name in
 ('mv_cron_secret','mv_vapid_public_key','mv_vapid_private_key','mv_vapid_subject');
$$;
revoke all on function public.mv_delivery_settings() from public,anon,authenticated;
grant execute on function public.mv_delivery_settings() to service_role;
