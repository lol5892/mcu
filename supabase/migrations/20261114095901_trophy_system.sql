-- Presentation metadata is independent of legacy rarity/XP. No award row is updated.
create table mv_private.trophy_presentation(id text primary key, title text not null, tier text not null check(tier in ('bronze','silver','gold','platinum')));
alter table mv_private.trophy_presentation enable row level security;
revoke all on mv_private.trophy_presentation from public,anon,authenticated;
insert into mv_private.trophy_presentation values ('films-1','Первый шаг Старка','bronze');
insert into mv_private.trophy_presentation values ('films-3','Нас уже не остановить','bronze');
insert into mv_private.trophy_presentation values ('films-5','Пятёрка супергероев','silver');
insert into mv_private.trophy_presentation values ('films-10','Фьюри нами гордится','silver');
insert into mv_private.trophy_presentation values ('films-15','Команда становится легендой','gold');
insert into mv_private.trophy_presentation values ('films-20','Два сердца. Двадцать историй','gold');
insert into mv_private.trophy_presentation values ('films-25','Мстители семейного масштаба','gold');
insert into mv_private.trophy_presentation values ('films-30','Наша собственная сага','gold');
insert into mv_private.trophy_presentation values ('films-35','Стражи киновселенной','platinum');
insert into mv_private.trophy_presentation values ('all-films-v1','Мы и есть Marvel','platinum');
insert into mv_private.trophy_presentation values ('phase-1-v1','Фьюри, мы собрали семью!','gold');
insert into mv_private.trophy_presentation values ('phase-2-v1','Щ.И.Т. хранит наш союз','gold');
insert into mv_private.trophy_presentation values ('phase-3-v1','Даже щелчок нас не разлучит','gold');
insert into mv_private.trophy_presentation values ('phase-4-v1','В каждой вселенной мы вместе','gold');
insert into mv_private.trophy_presentation values ('phase-5-v1','Семья сильнее мультивселенной','gold');
insert into mv_private.trophy_presentation values ('phase-6-v1','Наше наследие вечнее времени','gold');
insert into mv_private.trophy_presentation values ('hero-reactor','Сердце из реактора','bronze');
insert into mv_private.trophy_presentation values ('hero-stark','Семья Старков','silver');
insert into mv_private.trophy_presentation values ('hero-thor','Достойны Мьёльнира','silver');
insert into mv_private.trophy_presentation values ('hero-cap','До конца пути — вместе','silver');
insert into mv_private.trophy_presentation values ('hero-avengers','Антон и Таня. Мстители, общий сбор!','silver');
insert into mv_private.trophy_presentation values ('hero-infinity','Я люблю тебя в трёх тысячах вселенных','silver');
insert into mv_private.trophy_presentation values ('hero-spider','Наш дружелюбный сосед','silver');
insert into mv_private.trophy_presentation values ('hero-guardians','Мы — свои среди Стражей','silver');
insert into mv_private.trophy_presentation values ('hero-strange','Вместе во всех реальностях','silver');
insert into mv_private.trophy_presentation values ('hero-ant','Большая любовь маленьких героев','silver');
insert into mv_private.trophy_presentation values ('hero-panther','Ваканда — наша семья','silver');
insert into mv_private.trophy_presentation values ('hero-marvel','Выше звёзд','silver');
insert into mv_private.trophy_presentation values ('hero-fantastic','Фантастическая семья','bronze');
insert into mv_private.trophy_presentation values ('hero-deadpool','Хаос на двоих','bronze');
insert into mv_private.trophy_presentation values ('hero-endgame','Мы пережили Финал','bronze');
insert into mv_private.trophy_presentation values ('episodes-1','Первая серия нашей истории','bronze');
insert into mv_private.trophy_presentation values ('episodes-10','Продолжение следует…','bronze');
insert into mv_private.trophy_presentation values ('episodes-25','Ещё одну серию, и спать','silver');
insert into mv_private.trophy_presentation values ('episodes-50','Сериаломаньяки мультивселенной','gold');
insert into mv_private.trophy_presentation values ('episodes-100','100 серий вместе','platinum');
insert into mv_private.trophy_presentation values ('series-1','Наш первый завершённый сериал','silver');
insert into mv_private.trophy_presentation values ('series-3','Сериальный союз','gold');
insert into mv_private.trophy_presentation values ('series-5','Не можем остановиться','gold');
insert into mv_private.trophy_presentation values ('series-10','Хранители малых экранов','platinum');
insert into mv_private.trophy_presentation values ('serial-wandavision','Любовь сильнее магии хаоса','silver');
insert into mv_private.trophy_presentation values ('serial-loki','Семья вне времени','gold');
insert into mv_private.trophy_presentation values ('serial-what-if','Наш собственный вариант мультивселенной','gold');
insert into mv_private.trophy_presentation values ('serial-wandavision-trilogy','Только мы знаем, что реально','gold');
insert into mv_private.trophy_presentation values ('serial-daredevil','Друзья из Адской кухни','platinum');
insert into mv_private.trophy_presentation values ('serial-shield','Щ.И.Т. сообщает: семья под защитой','platinum');
insert into mv_private.trophy_presentation values ('serial-hawkeye','Стрела попала в сердце','silver');
insert into mv_private.trophy_presentation values ('defenders-v1','Новые защитники семьи','platinum');
insert into mv_private.trophy_presentation values ('anton-ratings-1','Первое мнение героя','bronze');
insert into mv_private.trophy_presentation values ('anton-ratings-5','Пять звёзд от Старка','silver');
insert into mv_private.trophy_presentation values ('anton-ratings-10','Критик Щ.И.Т.','silver');
insert into mv_private.trophy_presentation values ('anton-ratings-20','Эксперт Мстителей','gold');
insert into mv_private.trophy_presentation values ('anton-ratings-30','Легенда кинорейтингов','gold');
insert into mv_private.trophy_presentation values ('anton-perfect1','Идеальный кадр','bronze');
insert into mv_private.trophy_presentation values ('anton-strict1','Строгий судья Асгарда','bronze');
insert into mv_private.trophy_presentation values ('anton-rated-series5','Знаток сериалов','gold');
insert into mv_private.trophy_presentation values ('anton-rated-series10','Легенда малого экрана','gold');
insert into mv_private.trophy_presentation values ('tanya-ratings-1','Первое мнение героя','bronze');
insert into mv_private.trophy_presentation values ('tanya-ratings-5','Пять звёзд от Старка','silver');
insert into mv_private.trophy_presentation values ('tanya-ratings-10','Критик Щ.И.Т.','silver');
insert into mv_private.trophy_presentation values ('tanya-ratings-20','Эксперт Мстителей','gold');
insert into mv_private.trophy_presentation values ('tanya-ratings-30','Легенда кинорейтингов','gold');
insert into mv_private.trophy_presentation values ('tanya-perfect1','Идеальный кадр','bronze');
insert into mv_private.trophy_presentation values ('tanya-strict1','Строгий судья Асгарда','bronze');
insert into mv_private.trophy_presentation values ('tanya-rated-series5','Знаток сериалов','gold');
insert into mv_private.trophy_presentation values ('tanya-rated-series10','Легенда малого экрана','gold');
insert into mv_private.trophy_presentation values ('couple-paired1','Первый семейный вердикт','bronze');
insert into mv_private.trophy_presentation values ('couple-equal1','На одной волне','bronze');
insert into mv_private.trophy_presentation values ('couple-difference41','Гражданская война на диване','bronze');
insert into mv_private.trophy_presentation values ('couple-double101','Два сердца — один рейтинг','silver');
insert into mv_private.trophy_presentation values ('couple-paired5','Наш киноконсилиум','silver');
insert into mv_private.trophy_presentation values ('couple-paired10','Семейные кинокритики Marvel','silver');
insert into mv_private.trophy_presentation values ('couple-paired25','Совет Мстителей','gold');
insert into mv_private.trophy_presentation values ('couple-equal5','Идеальная гармония','silver');
insert into mv_private.trophy_presentation values ('couple-difference33','Даже спорим как супергерои','silver');
insert into mv_private.trophy_presentation values ('family-beginning','Антон и Таня: Начало легенды','bronze');
insert into mv_private.trophy_presentation values ('family-superpower','Ты — моя суперсила','silver');
insert into mv_private.trophy_presentation values ('family-thanos','Любовь, которую не отменит Танос','platinum');
insert into mv_private.trophy_presentation values ('family-vibranium','Наш союз крепче вибраниума','gold');
insert into mv_private.trophy_presentation values ('family-planets','Одна команда на всех планетах','gold');
insert into mv_private.trophy_presentation values ('family-worlds','В любом из миров я выбираю тебя','gold');
insert into mv_private.trophy_presentation values ('family-adventure','Наше большое приключение','platinum');

-- Snapshot only eligibility; never recalculate, insert or modify historical awards.
create table mv_private.trophy_baseline(family_id uuid not null references public.mv_families(id),achievement_id text not null,primary key(family_id,achievement_id));
alter table mv_private.trophy_baseline enable row level security;
revoke all on mv_private.trophy_baseline from public,anon,authenticated;
do $baseline$
declare d text; old_insert text; f uuid;
begin
 lock table public.mv_entries,public.mv_episodes,public.mv_ratings in share row exclusive mode;
 select pg_get_functiondef('mv_private.legend_refresh(uuid,boolean)'::regprocedure) into d;
 old_insert:=E'insert into public.mv_achievements(family_id,achievement_id,owner,xp,historical)\n values(f,a->>''id'',role_name,case a->>''rarity'' when ''legendary'' then 100 when ''epic'' then 50 when ''rare'' then 25 else 10 end,historical) on conflict do nothing;';
 if position(old_insert in d)=0 then raise exception 'Unexpected legend implementation; stop before altering any awards';end if;
 d:=replace(d,'mv_private.legend_refresh(', 'mv_private.trophy_capture_baseline(');
 d:=replace(d,old_insert,'insert into mv_private.trophy_baseline values(f,a->>''id'') on conflict do nothing;');
 execute d;
 for f in select id from public.mv_families loop perform mv_private.trophy_capture_baseline(f,true);end loop;
end$baseline$;
revoke all on function mv_private.trophy_capture_baseline(uuid,boolean) from public,anon,authenticated;
-- Extend the safe route allowlist without deleting existing notifications.
alter table public.mv_notifications drop constraint mv_notifications_route_check;
alter table public.mv_notifications add constraint mv_notifications_route_check check(route ~ '^/(letters|chat|project|moments|events|sessions|settings|legend)(/[a-zA-Z0-9-]+)?$');
create function mv_private.trophy_unlocked() returns trigger language plpgsql security definer set search_path='' as $$
declare m record;p mv_private.trophy_presentation;t text;
begin
 if new.historical or exists(select 1 from mv_private.trophy_baseline b where b.family_id=new.family_id and b.achievement_id=new.achievement_id) then return new;end if;
 select * into p from mv_private.trophy_presentation where id=new.achievement_id;
 if not found then return new;end if;
 for m in select user_id,role from public.mv_members where family_id=new.family_id and (new.owner='family' or role=new.owner) loop
 t:=case when new.owner='family' then 'Антон и Таня' when new.owner='anton' then 'Антон' else 'Таня' end||' · '||case p.tier when 'bronze' then 'БРОНЗА' when 'silver' then 'СЕРЕБРО' when 'gold' then 'ЗОЛОТО' else 'ПЛАТИНА' end||' — «'||p.title||'» · +'||new.xp||' XP';
 perform mv_private.notify(new.family_id,m.user_id,'achievement',t,'/legend/'||new.achievement_id,'trophy:'||new.family_id||':'||new.achievement_id||':'||m.user_id);
 end loop;
 return new;
end$$;
revoke all on function mv_private.trophy_unlocked() from public,anon,authenticated;
create trigger trophy_delivery after insert on public.mv_achievements for each row execute function mv_private.trophy_unlocked();

-- Keep inbox events, but do not accumulate achievement push jobs while opted out.
do $$declare d text;old_clause text:='where user_id=recipient and enabled on conflict do nothing';begin
 select pg_get_functiondef('mv_private.notify(uuid,uuid,text,text,text,text)'::regprocedure) into d;
 if position(old_clause in d)=0 then raise exception 'Unexpected notification helper';end if;
 d:=replace(d,old_clause,'where user_id=recipient and enabled and (k<>''achievement'' or exists(select 1 from public.mv_profiles p where p.id=recipient and p.notification_types->>''enabled''=''true'' and coalesce(p.notification_types->>''achievement'',''true'')<>''false'')) on conflict do nothing');execute d;
end$$;
