alter table public.mv_letters drop constraint mv_letters_reply_to_fkey;
alter table public.mv_letters add constraint mv_letters_reply_to_fkey foreign key(reply_to) references public.mv_letters on delete set null;
alter table public.mv_messages drop constraint mv_messages_reply_to_fkey;
alter table public.mv_messages add constraint mv_messages_reply_to_fkey foreign key(reply_to) references public.mv_messages on delete set null;
create function public.mv_export() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if mv_private.family() is null then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select jsonb_build_object('app','our-marvel-family','version',2,'exportedAt',now(),'userId',auth.uid(),'familyId',mv_private.family(),
 'entries',coalesce((select jsonb_agg(e) from public.mv_entries e),'[]'),
 'episodes',coalesce((select jsonb_agg(e) from public.mv_episodes e),'[]'),
 'ratings',coalesce((select jsonb_agg(r) from public.mv_ratings r),'[]'),
 'messages',coalesce((select jsonb_agg(m) from public.mv_messages m),'[]'),
 'letters',coalesce((select jsonb_agg(l) from public.mv_letters l),'[]'),
 'moments',coalesce((select jsonb_agg(m) from public.mv_moments m),'[]'),
 'events',coalesce((select jsonb_agg(e) from public.mv_events e),'[]'),
 'sessions',coalesce((select jsonb_agg(s) from public.mv_sessions s),'[]'),
 'reactions',coalesce((select jsonb_agg(r) from public.mv_reactions r),'[]'),
 'photoMetadata',coalesce((select jsonb_agg(m) from public.mv_media m),'[]'),
 'favorites',coalesce((select jsonb_agg(f) from public.mv_letter_favorites f),'[]'),
 'ratingHistory',coalesce((select jsonb_agg(h) from public.mv_rating_history h),'[]')) into result;
 return result;
end $$;
create function public.mv_delete_my_content(p_confirm text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();f uuid:=mv_private.family();
begin
 if f is null or p_confirm<>'УДАЛИТЬ МОИ ДАННЫЕ' then raise exception 'CONFIRMATION_REQUIRED' using errcode='42501';end if;
 if exists(select 1 from public.mv_media where author_id=u) then raise exception 'REMOVE_ATTACHMENTS_FIRST';end if;
 delete from public.mv_reactions where user_id=u;
 delete from public.mv_letter_favorites where user_id=u;
 delete from public.mv_letters where author_id=u;
 delete from public.mv_messages where author_id=u;
 delete from public.mv_moments where author_id=u;
 delete from public.mv_ratings where user_id=u;
 delete from public.mv_rating_history where user_id=u;
 delete from public.mv_legacy_ratings where family_id=f and role=mv_private.role();
 delete from public.mv_devices where user_id=u;
 delete from public.mv_notifications where recipient_id=u;
 update public.mv_events set status='cancelled',version=version+1 where author_id=u;
 update public.mv_profiles set avatar_path=null,notification_types='{}',nudge_frequency=0,letter_nudges=false,read_receipts=false where id=u;
 -- Shared progress and the partner's content are deliberately retained.
 -- Idempotency receipts contain no message/letter bodies and prevent retries
 -- from resurrecting removed content. Membership and Auth account remain.
end $$;
revoke execute on function public.mv_export(),public.mv_delete_my_content(text) from public,anon;
grant execute on function public.mv_export(),public.mv_delete_my_content(text) to authenticated;
