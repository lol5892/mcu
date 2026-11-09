create function public.mv_finalize_media(p_id uuid,p_size integer) returns void language plpgsql security definer set search_path='' as $$
declare m public.mv_media;rec uuid;
begin
 select * into m from public.mv_media where id=p_id for update;if not found then raise exception 'MEDIA_NOT_FOUND';end if;
 if m.ready then return;end if;
 update public.mv_media set ready=true,byte_size=p_size where id=p_id;
 if m.kind='avatar' then update public.mv_profiles set avatar_path=m.object_path where id=m.author_id;end if;
 -- Letter attachments stay private and generate no early notification.
 if m.kind in('moment','session') then
 select user_id into rec from public.mv_members where family_id=m.family_id and user_id<>m.author_id;
 if rec is not null then perform mv_private.notify(m.family_id,rec,'photo','Новое воспоминание в нашей вселенной ❤️',case when m.kind='session' then '/sessions/' else '/moments/' end||m.target_id,'photo:'||m.id);end if;
 end if;
end $$;
revoke execute on function public.mv_finalize_media(uuid,integer) from public,anon,authenticated;
grant execute on function public.mv_finalize_media(uuid,integer) to service_role;
