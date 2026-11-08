import json, pathlib
out=[]
films='''iron-man|Железный человек|Iron Man|2008-05-02|1|Тони Старк создаёт бронекостюм и решает изменить наследие своей компании.
hulk|Невероятный Халк|The Incredible Hulk|2008-06-13|1|Брюс Бэннер ищет способ обуздать силу, которую пробуждает его гнев.
iron-man-2|Железный человек 2|Iron Man 2|2010-05-07|1|Старк сталкивается с последствиями публичного раскрытия своей личности.
thor|Тор|Thor|2011-05-06|1|Изгнанный наследник Асгарда учится ответственности на Земле.
first-avenger|Первый мститель|Captain America: The First Avenger|2011-07-22|1|Стив Роджерс становится суперсолдатом во время Второй мировой войны.
avengers|Мстители|The Avengers|2012-05-04|1|Ник Фьюри объединяет героев перед угрозой вторжения в Нью-Йорк.
iron-man-3|Железный человек 3|Iron Man 3|2013-05-03|2|После битвы за Нью-Йорк Тони предстоит заново найти опору в себе.
thor-dark|Тор 2: Царство тьмы|Thor: The Dark World|2013-11-08|2|Тор и Локи вынуждены объединиться против древней угрозы Девяти мирам.
winter-soldier|Первый мститель: Другая война|Captain America: The Winter Soldier|2014-04-04|2|Стив и Наташа распутывают заговор внутри Щ.И.Т.
guardians|Стражи Галактики|Guardians of the Galaxy|2014-08-01|2|Пять космических изгоев неожиданно становятся командой.
ultron|Мстители: Эра Альтрона|Avengers: Age of Ultron|2015-05-01|2|Искусственный интеллект Старка выбирает опасный путь к миру на Земле.
ant-man|Человек-муравей|Ant-Man|2015-07-17|2|Скотт Лэнг получает костюм, позволяющий уменьшаться до размеров насекомого.
civil-war|Первый мститель: Противостояние|Captain America: Civil War|2016-05-06|3|Спор о контроле над супергероями раскалывает Мстителей.
strange|Доктор Стрэндж|Doctor Strange|2016-11-04|3|Хирург ищет исцеление и открывает мир мистических искусств.
guardians-2|Стражи Галактики. Часть 2|Guardians of the Galaxy Vol. 2|2017-05-05|3|Питер Квилл узнаёт о своём происхождении, а команда — о значении семьи.
spider-home|Человек-паук: Возвращение домой|Spider-Man: Homecoming|2017-07-07|3|Питер Паркер пытается совместить школу с жизнью молодого героя.
ragnarok|Тор: Рагнарёк|Thor: Ragnarok|2017-11-03|3|Вдали от Асгарда Тор собирает союзников, чтобы остановить Хелу.
panther|Чёрная пантера|Black Panther|2018-02-16|3|Т’Чалла принимает трон Ваканды и ответственность за её будущее.
infinity-war|Мстители: Война бесконечности|Avengers: Infinity War|2018-04-27|3|Герои Земли и космоса противостоят поискам Камней бесконечности Таносом.
ant-wasp|Человек-муравей и Оса|Ant-Man and the Wasp|2018-07-06|3|Скотт и Хоуп отправляются на спасательную миссию в квантовый мир.
captain-marvel|Капитан Марвел|Captain Marvel|2019-03-08|3|Кэрол Дэнверс возвращается на Землю 1990-х и ищет утраченное прошлое.
endgame|Мстители: Финал|Avengers: Endgame|2019-04-26|3|Оставшиеся Мстители ищут шанс исправить последствия щелчка.
spider-far|Человек-паук: Вдали от дома|Spider-Man: Far From Home|2019-07-02|3|Европейские каникулы Питера прерываются появлением нового героя.
widow|Чёрная вдова|Black Widow|2021-07-09|4|Наташа возвращается к своей первой семье и тайнам Красной комнаты.
shang-chi|Шан-Чи и легенда десяти колец|Shang-Chi and the Legend of the Ten Rings|2021-09-03|4|Мастер боевых искусств встречается с отцом и наследием Десяти колец.
eternals|Вечные|Eternals|2021-11-05|4|Древние защитники Земли собираются после тысячелетий разлуки.
spider-no-way|Человек-паук: Нет пути домой|Spider-Man: No Way Home|2021-12-17|4|Попытка Питера вернуть анонимность открывает границы мультивселенной.
strange-2|Доктор Стрэндж: В мультивселенной безумия|Doctor Strange in the Multiverse of Madness|2022-05-06|4|Стрэндж защищает девушку, способную перемещаться между вселенными.
thor-love|Тор: Любовь и гром|Thor: Love and Thunder|2022-07-08|4|Тор вновь встречает Джейн Фостер на пути к сражению с Горром.
wakanda|Чёрная пантера: Ваканда навеки|Black Panther: Wakanda Forever|2022-11-11|4|Ваканда переживает утрату короля и столкновение с подводным народом.
quantumania|Человек-муравей и Оса: Квантомания|Ant-Man and the Wasp: Quantumania|2023-02-17|5|Семья Лэнгов оказывается в квантовой вселенной под властью Канга.
guardians-3|Стражи Галактики. Часть 3|Guardians of the Galaxy Vol. 3|2023-05-05|5|Прошлое Ракеты заставляет Стражей рискнуть всем ради друга.
marvels|Капитан Марвел 2|The Marvels|2023-11-10|5|Кэрол, Моника и Камала обнаруживают неожиданную связь своих способностей.
deadpool|Дэдпул и Росомаха|Deadpool & Wolverine|2024-07-26|5|Дэдпул втягивает Росомаху в путешествие по мультивселенной MCU.
brave-world|Капитан Америка: Новый мир|Captain America: Brave New World|2025-02-14|5|Сэм Уилсон с щитом Капитана Америки оказывается в центре политического кризиса.
thunderbolts|Громовержцы*|Thunderbolts*|2025-05-02|5|Группа неоднозначных героев пытается выбраться из смертельной ловушки.
fantastic-four|Фантастическая четвёрка: Первые шаги|The Fantastic Four: First Steps|2025-07-25|6|Первая семья Marvel защищает свою ретрофутуристическую Землю от Галактуса.
spider-new|Человек-паук: Совершенно новый день|Spider-Man: Brand New Day|2026-07-31|6|Четвёртый фильм с Томом Холландом продолжает самостоятельный путь Питера Паркера.'''
base_sources=['https://www.marvel.com/movies','https://www.disneyplus.com/explore/articles/marvel-movies-in-order/','https://editorial.rottentomatoes.com/guide/marvel-movie-release-timeline/']
for line in films.splitlines():
 id,ru,en,date,phase,desc=line.split('|');out.append(dict(id=id,title=ru,original=en,date=date,year=int(date[:4]),phase=int(phase),type='film',section='main',seasons=[],seasonCount=0,description=desc,sources=base_sources))
# A series stays one project. Each season has its own premiere, phase and episode count.
shows='''wandavision|Ванда/Вижн|WandaVision|main|4|2021-01-15:9|Ванда и Вижн живут в мире ситкома, за которым скрывается загадка.
falcon|Сокол и Зимний солдат|The Falcon and the Winter Soldier|main|4|2021-03-19:6|Сэм и Баки ищут своё место в мире после возвращения исчезнувших.
loki|Локи|Loki|main|4,5|2021-06-09:6,2023-10-05:6|Бог обмана знакомится с организацией, контролирующей течение времени.
what-if|Что, если…?|What If...?|animation|4,5,5|2021-08-11:9,2023-12-22:9,2024-12-22:8|Наблюдатель показывает альтернативные варианты ключевых событий MCU.
hawkeye|Соколиный глаз|Hawkeye|main|4|2021-11-24:6|Клинт Бартон и Кейт Бишоп встречают опасности рождественского Нью-Йорка.
moon-knight|Лунный рыцарь|Moon Knight|main|4|2022-03-30:6|Жизнь Стивена Гранта оказывается связана с египетскими богами и Марком Спектором.
ms-marvel|Мисс Марвел|Ms. Marvel|main|4|2022-06-08:6|Камала Хан из Джерси-Сити открывает собственные сверхспособности.
groot|Я есть Грут|I Am Groot|main|4,5|2022-08-10:5,2023-09-06:5|Короткие приключения малыша Грута между космическими странствиями.
she-hulk|Женщина-Халк: Адвокат|She-Hulk: Attorney at Law|main|4|2022-08-18:9|Адвокат Дженнифер Уолтерс учится жить с силой Халка.
secret-invasion|Секретное вторжение|Secret Invasion|main|5|2023-06-21:6|Ник Фьюри возвращается на Землю, где скруллы скрываются среди людей.
echo|Эхо|Echo|main|5|2024-01-09:5|Майя Лопес возвращается к своим корням и последствиям жизни с Фиском.
agatha|Это всё Агата|Agatha All Along|main|5|2024-09-18:9|Агата Харкнесс собирает ковен для путешествия по Дороге ведьм.
born-again|Сорвиголова: Рождённый заново|Daredevil: Born Again|main|5,6|2025-03-04:9,2026-03-24:8|Мэтт Мёрдок и Уилсон Фиск вновь борются за будущее Нью-Йорка.
ironheart|Железное сердце|Ironheart|main|5|2025-06-24:6|Изобретательница Рири Уильямс возвращается в Чикаго, где технологии встречают магию.
wakanda-eyes|Очи Ваканды|Eyes of Wakanda|main|6|2025-08-01:4|Воины Ваканды возвращают похищенные вибраниумные артефакты в разные эпохи.
zombies|Зомби Marvel|Marvel Zombies|animation|6|2025-09-24:4|В альтернативной ветви MCU выжившие противостоят заражённым супергероям.
friendly-spider|Ваш дружелюбный сосед Человек-паук|Your Friendly Neighborhood Spider-Man|animation|5|2025-01-29:10|Альтернативная история взросления Питера Паркера, отдельная от основной линии MCU.
xmen97|Люди Икс ’97|X-Men '97|animation|0,0|2024-03-20:10,2026-07-01:9|Продолжение мультсериала о мутантах 1990-х. Отдельная анимационная вселенная.
wonder-man|Чудо-человек|Wonder Man|main|6|2026-01-27:8|Актёр Саймон Уильямс ищет большую роль в Голливуде вместе с Тревором Слэттери.
visionquest|ВижнКвест|VisionQuest|main|6|2026-10-13:8|Белый Вижн пытается понять своё прошлое, память и собственную личность.
daredevil|Сорвиголова|Daredevil|defenders|0,0,0|2015-04-10:13,2016-03-18:13,2018-10-19:13|Незрячий адвокат Мэтт Мёрдок защищает Адскую кухню днём и ночью.
jessica|Джессика Джонс|Jessica Jones|defenders|0,0,0|2015-11-20:13,2018-03-08:13,2019-06-14:13|Частный детектив со сверхсилой разбирается с делами и травмами прошлого.
luke|Люк Кейдж|Luke Cage|defenders|0,0|2016-09-30:13,2018-06-22:13|Неуязвимый герой становится защитником Гарлема.
iron-fist|Железный кулак|Iron Fist|defenders|0,0|2017-03-17:13,2018-09-07:10|Дэнни Рэнд возвращается в Нью-Йорк после обучения в К’унь-Луне.
defenders|Защитники|The Defenders|defenders|0|2017-08-18:8|Четверо уличных героев объединяются против организации Рука.
punisher|Каратель|The Punisher|defenders|0,0|2017-11-17:13,2019-01-18:13|Фрэнк Касл раскрывает заговор, связанный с гибелью его семьи.
shield|Агенты Щ.И.Т.|Agents of S.H.I.E.L.D.|related|0,0,0,0,0,0,0|2013-09-24:22,2014-09-23:22,2015-09-29:22,2016-09-20:22,2017-12-01:22,2019-05-10:13,2020-05-27:13|Команда Фила Колсона расследует сверхъестественные угрозы. Поздние сезоны расходятся с основной линией MCU.
carter|Агент Картер|Agent Carter|related|0,0|2015-01-06:8,2016-01-19:10|Послевоенные приключения Пегги Картер. Сериал вынесен отдельно: статус всей истории в актуальном каноне не закреплён однозначно.
inhumans|Сверхлюди|Inhumans|related|0|2017-09-29:8|Королевская семья Аттилана оказывается на Земле. Канонический статус неоднозначен; дата телевизионной премьеры.
runaways|Беглецы|Runaways|related|0,0,0|2017-11-21:10,2018-12-21:13,2019-12-13:10|Подростки обнаруживают, что их родители скрывают опасную тайну. Канонический статус неоднозначен.
cloak-dagger|Плащ и Кинжал|Cloak & Dagger|related|0,0|2018-06-07:10,2019-04-04:10|Тайрон и Тэнди открывают взаимосвязанные способности. Канонический статус неоднозначен.
slingshot|Агенты Щ.И.Т.: Йо-Йо|Agents of S.H.I.E.L.D.: Slingshot|related|0|2016-12-13:6|Короткий веб-сериал об Елене Родригес; дополнение к Агентам Щ.И.Т.
helstrom|Хелстром|Helstrom|related|0|2020-10-16:10|Брат и сестра расследуют демонические явления. Проект Marvel Television вне подтверждённого основного канона MCU.'''
for line in shows.splitlines():
 id,ru,en,section,phases,seasons,desc=line.split('|'); phases=list(map(int,phases.split(','))); ss=[]
 for i,s in enumerate(seasons.split(',')):
  d,n=s.split(':'); ss.append(dict(number=i+1,date=d,episodes=int(n),phase=phases[i] or None))
 p=dict(id=id,title=ru,original=en,date=ss[0]['date'],year=int(ss[0]['date'][:4]),phase=phases[0] or None,type='series',section=section,seasons=ss,seasonCount=len(ss),description=desc,sources=['https://www.marvel.com/tv-shows','https://www.disneyplus.com/explore/articles/marvel-movies-in-order/'])
 if id=='visionquest':
  ss[0]['episodeDates']=['2026-10-13']*2+['2026-10-20']*2+['2026-10-27']*2+['2026-11-03','2026-11-10']
  p['sources']=['https://thewaltdisneycompany.com/news/marvel-television-visionquest-disney-plus/','https://www.imdb.com/title/tt23112594/episodes/','https://www.tvmaze.com/shows/64950/visionquest/episodeguide']
 if id=='xmen97':p['sources']=['https://press.disney.co.uk/news/marvel-animations-x-men-97-season-2-now-streaming-exclusively-on-disney','https://www.tvmaze.com/shows/58951/x-men-97']
 if id=='born-again':p['sources']=['https://www.disneyplus.com/whats-on/series/daredevil-born-again-season-two','https://press.disney.co.uk/news/marvel-television-reveals-trailer-%26-key-art-for-the-highly-anticipated-second-season-of-daredevil-born-again']
 if id=='wonder-man':p['sources']=['https://thewaltdisneycompany.com/news/marvel-television-wonder-man/','https://www.imdb.com/title/tt21066182/episodes/']
 out.append(p)
specials='''werewolf|Ночной оборотень|Werewolf by Night|2022-10-07|4|Охотники на монстров собираются в поместье Бладстоунов.
holiday|Стражи Галактики: Праздничный спецвыпуск|The Guardians of the Galaxy Holiday Special|2022-11-25|4|Мантис и Дракс ищут на Земле идеальный рождественский подарок для Питера.
punisher-special|Каратель: Последнее убийство|The Punisher: One Last Kill|2026-05-12|6|Фрэнк Касл вновь сталкивается с насилием в отдельном сюжетном спецвыпуске.
consultant|Консультант|The Consultant|2011-09-13|1|Короткая история о том, как агенты Щ.И.Т. решают проблему с инициативой Мстители.
thor-hammer|Забавный случай по дороге к молоту Тора|A Funny Thing Happened on the Way to Thor’s Hammer|2011-10-25|1|Фил Колсон делает остановку на заправке по пути в Нью-Мексико.
item47|Образец 47|Item 47|2012-09-25|1|Обычная пара находит оружие читаури после битвы за Нью-Йорк.
carter-short|Агент Картер: короткометражка|Agent Carter|2013-09-03|2|Пегги Картер берётся за самостоятельную послевоенную миссию.
king|Да здравствует король|All Hail the King|2014-02-04|2|Тревор Слэттери принимает необычного посетителя в тюрьме.'''
for line in specials.splitlines():
 id,ru,en,date,phase,desc=line.split('|');out.append(dict(id=id,title=ru,original=en,date=date,year=int(date[:4]),phase=int(phase),type='special',section='main',seasons=[],seasonCount=0,description=desc,sources=['https://www.marvel.com/tv-shows','https://www.disneyplus.com/explore/articles/marvel-movies-in-order/']))
for p in out:
 if p['id']=='spider-new':p['sources']=['https://www.sony.com/en/SonyInfo/blog/2026/08/04/','https://www.amctheatres.com/movies/spider-man-brand-new-day-78598']
 if p['id']=='punisher-special':p['sources']=['https://thewaltdisneycompany.com/news/the-punisher-one-last-kill/','https://d23.com/the-punisher-one-last-kill-behind-the-scenes-of-marvel-televisions-dark-action-packed-special-presentation-on-disney/']
# A conservative, documented partial story order. No invented order for uncertain projects.
chron=['wakanda-eyes','first-avenger','carter-short','captain-marvel','iron-man','iron-man-2','hulk','thor-hammer','thor','consultant','avengers','item47','thor-dark','iron-man-3','king','winter-soldier','guardians','guardians-2','groot','ultron','ant-man','civil-war','widow','panther','spider-home','strange','ragnarok','ant-wasp','infinity-war','endgame','loki','wandavision','falcon','shang-chi','spider-far','eternals','spider-no-way','strange-2','hawkeye','moon-knight','wakanda','echo','she-hulk','ms-marvel','thor-love','werewolf','holiday','quantumania','guardians-3','secret-invasion','marvels','agatha','ironheart','born-again','brave-world','thunderbolts','spider-new']
for p in out:
 p['chronology']=chron.index(p['id'])+1 if p['id'] in chron else None
 p['poster']='covers/'+p['id']+'.svg'
 p['verifiedAt']='2026-11-08'
 p['dateConvention']='US release / first streaming availability; One-Shots: first official home/digital release'
future=[dict(id='doomsday',title='Мстители: Судный день',original='Avengers: Doomsday',date='2026-12-18',year=2026,phase=6,type='film',section='future',seasons=[],seasonCount=0,description='Будущий фильм. Дата анонсирована; в прогресс вышедших проектов не входит.',sources=['https://movies.disney.com/avengers-doomsday'],chronology=None,poster='covers/doomsday.svg',verifiedAt='2026-11-08'),dict(id='secret-wars',title='Мстители: Секретные войны',original='Avengers: Secret Wars',date='2027-12-17',year=2027,phase=6,type='film',section='future',seasons=[],seasonCount=0,description='Анонсированное продолжение саги мультивселенной. Дата может измениться.',sources=base_sources,chronology=None,poster='covers/secret-wars.svg',verifiedAt='2026-11-08')]
out+=future
audit_path=pathlib.Path('docs/series-audit.json')
if audit_path.exists():
 audit=json.loads(audit_path.read_text())
 for row in audit['results']:
  p=next((p for p in out if p['id']==row['id']),None)
  if p and row.get('source'):
   p['sources']=list(dict.fromkeys(p['sources']+[row['source']]+(['https://www.imdb.com/title/'+row['imdb']+'/episodes/'] if row.get('imdb') else [])))
pathlib.Path('src/catalog.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(f'{len(out)} projects; {sum(p["type"]=="film" and p["section"]!="future" for p in out)} released movies')
