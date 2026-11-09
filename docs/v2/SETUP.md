# Подключение настоящего семейного backend

Инструкция воспроизведения конфигурации 2.0. Фактический статус проекта и проверок находится в HOSTED-STATUS.md и TEST-REPORT.md. Постоянный адрес: https://lol5892.github.io/mcu/ . Не подключайте production к непроверенному backend.

## 1. Supabase Free

В ChatGPT: Настройки → Приложения → Supabase → Подключить. Если аккаунта нет, зарегистрируйтесь на https://supabase.com/dashboard через GitHub. Создайте отдельный Free проект для этой семьи; не выбирайте платные дополнения. Пароль БД и server keys вводите только в защищённые настройки сервисов/окружения, не в переписку.

Оператору нужен подтверждаемый email Антона: он записывается в `mv_private.bootstrap` и не попадает в публичный GitHub. Только этот адрес может создать семью. Email Тани и одноразовая ссылка создаются Антоном уже в интерфейсе. Администратор Supabase — техническая роль платформы, не семейное членство.

## 2. Auth и почта

Authentication → URL Configuration: Site URL `https://lol5892.github.io/mcu/`; Redirect URL тот же. Не добавляйте wildcard на чужие origins. Email provider включён; Confirm Email включён; anonymous sign-in выключен. PKCE сессия сохраняется, есть вход по коду или ссылке на том же iPhone. В шаблоне Magic Link/Signup можно показать `{{ .Token }}` для ручного ввода кода и `{{ .ConfirmationURL }}` для ссылки.

**Важное ограничение официальной почты Supabase:** без custom SMTP письма отправляются только адресам участников команды проекта, а не любому адресу. Для нормального семейного входа настройте собственный SMTP с бесплатным тарифом или проверенным существующим почтовым аккаунтом; реквизиты вводятся в Supabase, не в GitHub и не в чат. Не отключайте подтверждение email ради обхода проблемы. Документация: https://supabase.com/docs/guides/auth/auth-smtp . После настройки реально проверьте получение кода на оба адреса. Платные сервисы без согласия владельца не подключаются.

## 3. SQL и приватное послание

После проверки целевого проекта примените `supabase/migrations/*.sql` по порядку. Все объекты приложения имеют префикс mv_. Метаданные существующего каталога находятся в миграции 007 и генерируются из исходного `catalog.json`. Другие проекты и локальные iPhone базы не трогаются.

Исходные персональные слова Антона подготовлены **вне публичного репозитория** в защищённом файле текущей рабочей среды. Не копируйте их в frontend, public/, GitHub issues/PR или скриншоты для публичного отчёта. Оператор запускает `scripts/provision-owner.mjs` с `OWNER_EMAIL` и приватным `WELCOME_FILE`, затем применяет сформированный приватный SQL через защищённое соединение к выбранному Supabase. Само приложение читает текст только по RLS для Тани после приглашения.

## 4. Storage и Edge

Проверьте `marvel-private`: public=false, ограничение 3 МБ, прямые authenticated upload/delete не разрешены. Deploy `media-upload` и `push-dispatch`. Обе функции имеют `verify_jwt=false` лишь потому, что проверяют авторизацию сами: media через auth.getUser(), dispatcher через server CRON_SECRET. Не убирайте эти проверки. Media также проверяет членство/владельца и независимо перекодирует JPEG.

Секреты отправки текущего проекта хранятся в Vault (mv_vapid_public_key, mv_vapid_private_key, mv_vapid_subject, mv_cron_secret) и доступны только сервисному mv_delivery_settings RPC. Также поддерживаются отдельные Edge env overrides. Стандартные переменные Edge: SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY предоставляет проект; добавляются VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (`mailto:` контакт владельца), CRON_SECRET, APP_ORIGINS=`https://lol5892.github.io`. Секреты не должны иметь префикса VITE_. Генератор `scripts/generate-push-secrets.mjs` сохраняет их вне репозитория, не выводя значения. Не генерируйте ключи повторно после подписки устройств.

Для CLI используйте официальный Supabase CLI с авторизацией через защищённое окружение; `supabase functions deploy media-upload`, `supabase functions deploy push-dispatch`, `supabase secrets set --env-file <private-file>`. CLI/Management token вводится в настройки среды, а не передаётся в чате. Альтернатива — подключённые инструменты Supabase без передачи ключей в переписке.

## 5. Cron/Vault

В Vault создайте `mv_app_url` (URL проекта Supabase) и `mv_cron_secret` (тот же CRON_SECRET, что у Edge), используя защищённый интерфейс. Выполните `supabase/setup-scheduler.sql`. Job работает каждую минуту, читает секрет из Vault и вызывает dispatcher. Убедитесь, что Edge работает до проверки отложенных писем. Free проект может приостанавливаться; это влияет на своевременность писем/напоминаний. Задним числом письма доставятся после восстановления scheduler, но точность до минуты при паузе не обещается.

## 6. GitHub Actions

Текущий workflow загружает публичную конфигурацию из `.github/family-public.env` и валидирует её. Ниже имена разрешённых браузерных значений (server secrets в этом файле запрещены):

- VITE_SUPABASE_URL — публичный URL проекта.
- VITE_SUPABASE_PUBLISHABLE_KEY — **publishable/anon**, не service_role и не secret key.
- VITE_VAPID_PUBLIC_KEY — только публичная часть VAPID.

Deploy workflow проверяет формат конфигурации и отвергает server-role ключ. Ветка разработки имеет отдельные SQL, unit, браузерные и Edge checks; эти проверки не заменяют испытания production Auth/Storage/Realtime. После живых проверок PR можно слить в main: существующая ссылка Pages сохранится. Не удаляйте установленный PWA или данные Safari ради обновления: закрыть все окна и открыть повторно достаточно для смены Service Worker.
