-- Recover a single-use invitation when email confirmation opens another browser.
-- The recipient must still prove the exact invited email through Supabase Auth.
create function public.mv_join_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u auth.users; invitation uuid; can_create boolean:=false;
begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then
  return jsonb_build_object('can_create',false,'invitation_id',null);
 end if;
 if exists(select 1 from public.mv_members where user_id=u.id) then
  return jsonb_build_object('can_create',false,'invitation_id',null);
 end if;
 select coalesce(lower(u.email)=b.owner_email and b.family_id is null,false)
 into can_create from mv_private.bootstrap b where singleton;
 select i.id into invitation from mv_private.invitations i
 where i.email=lower(u.email) and i.accepted_at is null and i.expires_at>now()
 and not exists(select 1 from public.mv_members m where m.family_id=i.family_id and m.role='tanya')
 order by i.created_at desc limit 1;
 return jsonb_build_object('can_create',coalesce(can_create,false),'invitation_id',invitation);
end $$;

create function public.mv_accept_email_invite(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i mv_private.invitations; u auth.users;
begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'EMAIL_NOT_CONFIRMED';end if;
 select * into i from mv_private.invitations where id=p_id for update;
 if not found or i.accepted_at is not null or i.expires_at<=now() or lower(u.email)<>i.email
 then raise exception 'INVITATION_INVALID' using errcode='42501';end if;
 perform 1 from public.mv_families where id=i.family_id for update;
 if exists(select 1 from public.mv_members where user_id=u.id) then raise exception 'ALREADY_MEMBER';end if;
 if exists(select 1 from public.mv_members where family_id=i.family_id and role='tanya') then raise exception 'FAMILY_FULL';end if;
 insert into public.mv_profiles(id) values(u.id) on conflict do nothing;
 insert into public.mv_members(family_id,user_id,role) values(i.family_id,u.id,'tanya');
 update mv_private.invitations set accepted_at=now() where id=i.id;
 return i.family_id;
end $$;
revoke all on function public.mv_join_status(),public.mv_accept_email_invite(uuid) from public,anon;
grant execute on function public.mv_join_status(),public.mv_accept_email_invite(uuid) to authenticated;
