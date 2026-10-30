/** Transport-specific copy kept together; no provider diagnostics are interpolated. */
const en = {
  mode: 'Incoming connection', polling: 'Private server / Long polling (recommended)', webhook: 'Public HTTPS webhook',
  pollingHint: 'OMS connects outward to Telegram. No public IP, open router port or Tailscale Funnel is needed. Saving and enabling this mode removes the existing webhook without discarding pending updates. Do not run another receiver for this bot.',
  webhookHint: 'Telegram must reach the HTTPS webhook. Save this mode, then register the webhook after the previous receiver has stopped.',
  appUrl: 'OMS address for links (optional in polling mode)', appUrlHint: 'Use the private address you normally open through Tailscale. Opening OMS links on your phone still requires Tailscale. Leave empty to omit links.',
  timeout: 'Long-poll wait (seconds)', timeoutHint: '10–50 seconds; Telegram returns immediately when a message arrives. This is not a command delivery delay.',
  health: 'Incoming receiver', refresh: 'Refresh receiver status', lastPoll: 'Last successful poll', lastUpdate: 'Last committed update', retryAt: 'Next retry',
  setup: 'Save the bot token, username and polling mode, enable Telegram, then test the connection and update bot commands. Account linking and commands work through outbound HTTPS. A persistent production Node process is required.',
  secretHint: 'Only the bot token is required for polling. The scheduler secret below is optional and is used only by an external dispatcher.',
  rotationHint: 'Saved secrets remain private. Save a new token to restart the receiver safely. Account links survive token rotation for the same bot.',
  webhookReady: 'No webhook is registered; polling can receive updates.', webhookBlocked: 'A webhook is still registered. Check the receiver status; the polling worker removes it during setup.',
  migration: 'Receiver unavailable. Apply the Telegram polling migration and check database/Vault access.',
  receiverBusy: 'Another receiver is finishing a request. Retry after it stops; do not register a competing receiver.',
  changed: 'Connection settings changed. Refresh the settings and retry the action.',
  incomplete: 'Polling requires the bot API token and bot username. A public address and webhook secret are not required.',
  states: { disabled: 'Disabled', webhook: 'Webhook mode', waiting: 'Waiting for worker', polling: 'Receiving updates', backoff: 'Waiting to retry', unavailable: 'Unavailable' },
  errors: { database_unavailable: 'Database unavailable; updates are not acknowledged.', migration_required: 'Receiver migration is required.', invalid_credentials: 'Bot credentials were rejected.', bot_mismatch: 'Bot username and token do not match.', receiver_conflict: 'Another poller or webhook is using this bot. Stop it, then save settings to retry.', rate_limited: 'Telegram rate limit; retry timing is respected.', transport_error: 'Telegram could not be reached. Reconnecting automatically.', invalid_response: 'Telegram returned an unexpected response. Retrying safely.' }
};
type Copy = { [K in keyof typeof en]: typeof en[K] extends string ? string : Record<keyof typeof en[K], string> };
const ru: Copy = {
  mode: 'Получение сообщений', polling: 'Локальный сервер / Long polling (рекомендуется)', webhook: 'Публичный HTTPS webhook',
  pollingHint: 'OMS сам подключается к Telegram. Публичный IP, открытые порты и Tailscale Funnel не нужны. После сохранения и включения этого режима существующий webhook удаляется без удаления ожидающих обновлений. Не запускайте второй приёмник для этого бота.',
  webhookHint: 'Telegram должен иметь доступ к HTTPS webhook. Сохраните режим и зарегистрируйте webhook после остановки предыдущего приёмника.',
  appUrl: 'Адрес OMS для ссылок (необязателен при polling)', appUrlHint: 'Укажите обычный приватный адрес OMS в Tailscale. Для открытия ссылок OMS на телефоне по-прежнему нужен Tailscale. Пустое поле отключает ссылки.',
  timeout: 'Ожидание long polling (секунды)', timeoutHint: '10–50 секунд; при появлении сообщения Telegram отвечает сразу. Это не задержка выполнения команды.',
  health: 'Приём сообщений', refresh: 'Обновить состояние приёмника', lastPoll: 'Последний успешный опрос', lastUpdate: 'Последнее сохранённое обновление', retryAt: 'Следующая попытка',
  setup: 'Сохраните токен, имя бота и режим polling, включите Telegram, затем проверьте соединение и обновите команды. Привязка аккаунта и команды работают через исходящий HTTPS. Нужен постоянно работающий production-процесс Node.',
  secretHint: 'Для polling нужен только токен бота. Секрет планировщика ниже необязателен и используется только внешним диспетчером.',
  rotationHint: 'Сохранённые секреты не раскрываются. Новый токен безопасно перезапускает приёмник. При смене токена того же бота привязки аккаунтов сохраняются.',
  webhookReady: 'Webhook не зарегистрирован; polling может получать сообщения.', webhookBlocked: 'Webhook ещё зарегистрирован. Проверьте состояние приёмника: при настройке polling он удаляется автоматически.',
  migration: 'Приёмник недоступен. Примените миграцию Telegram polling и проверьте доступ к базе данных и Vault.',
  receiverBusy: 'Другой приёмник завершает запрос. Повторите действие после его остановки; не запускайте конкурирующий приёмник.',
  changed: 'Настройки соединения изменились. Обновите настройки и повторите действие.',
  incomplete: 'Для polling нужны API-токен и имя бота. Публичный адрес и секрет webhook не требуются.',
  states: { disabled: 'Выключен', webhook: 'Режим webhook', waiting: 'Ожидание обработчика', polling: 'Приём обновлений', backoff: 'Ожидание повтора', unavailable: 'Недоступен' },
  errors: { database_unavailable: 'База данных недоступна; обновления не подтверждаются.', migration_required: 'Требуется миграция приёмника.', invalid_credentials: 'Данные бота отклонены.', bot_mismatch: 'Имя бота не соответствует токену.', receiver_conflict: 'Бот используется другим приёмником или webhook. Остановите его и сохраните настройки для повтора.', rate_limited: 'Лимит Telegram; повтор выполняется через указанный интервал.', transport_error: 'Нет соединения с Telegram. Переподключение выполняется автоматически.', invalid_response: 'Неожиданный ответ Telegram. Выполняется безопасный повтор.' }
};
const lv: Copy = {
  mode: 'Ienākošais savienojums', polling: 'Privāts serveris / Long polling (ieteicams)', webhook: 'Publisks HTTPS webhook',
  pollingHint: 'OMS pats izveido savienojumu ar Telegram. Publiska IP adrese, atvērti maršrutētāja porti un Tailscale Funnel nav vajadzīgi. Saglabājot un ieslēdzot šo režīmu, esošais webhook tiek noņemts, nezaudējot gaidošos atjauninājumus. Nedarbiniet otru šī bota saņēmēju.',
  webhookHint: 'Telegram jāvar sasniegt HTTPS webhook. Saglabājiet režīmu un reģistrējiet webhook pēc iepriekšējā saņēmēja apturēšanas.',
  appUrl: 'OMS adrese saitēm (polling režīmā nav obligāta)', appUrlHint: 'Izmantojiet parasto privāto OMS adresi Tailscale tīklā. OMS saišu atvēršanai tālrunī joprojām vajadzīgs Tailscale. Atstājiet tukšu, lai saites nepievienotu.',
  timeout: 'Long polling gaidīšana (sekundes)', timeoutHint: '10–50 sekundes; saņemot ziņojumu, Telegram atbild uzreiz. Tā nav komandas izpildes aizkave.',
  health: 'Ziņojumu saņēmējs', refresh: 'Atjaunot saņēmēja statusu', lastPoll: 'Pēdējā veiksmīgā aptauja', lastUpdate: 'Pēdējais saglabātais atjauninājums', retryAt: 'Nākamais mēģinājums',
  setup: 'Saglabājiet bota tokenu, lietotājvārdu un polling režīmu, ieslēdziet Telegram, pārbaudiet savienojumu un atjaunojiet komandas. Konta piesaiste un komandas darbojas ar izejošu HTTPS savienojumu. Vajadzīgs pastāvīgi darbināts production Node process.',
  secretHint: 'Polling režīmam vajadzīgs tikai bota tokens. Zemāk esošais plānotāja noslēpums nav obligāts; to izmanto tikai ārējs nosūtīšanas plānotājs.',
  rotationHint: 'Saglabātie noslēpumi netiek atklāti. Saglabājot jaunu tokenu, saņēmējs droši restartējas. Mainot tā paša bota tokenu, kontu piesaistes saglabājas.',
  webhookReady: 'Webhook nav reģistrēts; polling var saņemt atjauninājumus.', webhookBlocked: 'Webhook vēl ir reģistrēts. Pārbaudiet saņēmēja statusu; polling iestatīšanas laikā tas tiek noņemts.',
  migration: 'Saņēmējs nav pieejams. Lietojiet Telegram polling migrāciju un pārbaudiet datubāzes un Vault piekļuvi.',
  receiverBusy: 'Cits saņēmējs pabeidz pieprasījumu. Mēģiniet vēlreiz pēc tā apturēšanas; nereģistrējiet konkurējošu saņēmēju.',
  changed: 'Savienojuma iestatījumi ir mainīti. Atjaunojiet iestatījumus un mēģiniet vēlreiz.',
  incomplete: 'Polling režīmam vajadzīgs bota API tokens un lietotājvārds. Publiska adrese un webhook noslēpums nav vajadzīgi.',
  states: { disabled: 'Izslēgts', webhook: 'Webhook režīms', waiting: 'Gaida apstrādātāju', polling: 'Saņem atjauninājumus', backoff: 'Gaida atkārtojumu', unavailable: 'Nav pieejams' },
  errors: { database_unavailable: 'Datubāze nav pieejama; atjauninājumi netiek apstiprināti.', migration_required: 'Vajadzīga saņēmēja migrācija.', invalid_credentials: 'Bota piekļuves dati tika noraidīti.', bot_mismatch: 'Bota lietotājvārds neatbilst tokenam.', receiver_conflict: 'Botu izmanto cits saņēmējs vai webhook. Apturiet to un saglabājiet iestatījumus, lai mēģinātu vēlreiz.', rate_limited: 'Telegram pieprasījumu limits; tiks ievērots atkārtojuma intervāls.', transport_error: 'Telegram nav sasniedzams. Savienojums tiek automātiski atjaunots.', invalid_response: 'Negaidīta Telegram atbilde. Tiek veikts drošs atkārtojums.' }
};
export function telegramReceiverCopy(locale: string | null | undefined): Copy {
  const language = locale?.split('-')[0];
  return language === 'ru' ? ru : language === 'lv' ? lv : en;
}
