/** Account-security copy is shared by the personal settings and phone assistant. */
const en = {
  account:'Linked OMS account', telegramId:'Telegram user ID', approvalTitle:'Confirm your Telegram account',
  approvalHint:'Press Start in Telegram, then return here. Confirm only the Telegram identity that belongs to you. Do not share the connection link.',
  identityCheck:'This is my Telegram account', approve:'Confirm and connect', confirmed:'Telegram is now linked to your OMS account.',
  approvalExpired:'This confirmation expired or was already used. Refresh and create a new connection link.',
  companyDisabled:'Company Telegram delivery is unavailable or disabled. You can still change personal preferences or disconnect.',
  preferences:'My phone notifications', preferencesHint:'Only notifications addressed to your OMS account are eligible. These choices also respect company rules and your existing notification preferences.',
  categories:{ORDER:'Orders and production',CHAT:'Messages and mentions',INVENTORY:'Inventory and materials',SYSTEM:'System notifications'},
  preview:'Phone message preview', full:'Show notification details', private:'Hide details — notification only',
  privacyHint:'Private preview hides titles and message text in automatic alerts. Commands you explicitly request may still return your accessible details.',
  ai:'Allow OpenRouter answers for my account', aiHint:'When you use /ask, relevant accessible OMS records are sent to the configured AI provider. The assistant can search orders but cannot change them.',
  aiUnavailable:'R&D must also enable the Telegram assistant. Your personal choice cannot enable it for the company.',
  aiConsentRequired:'AI answers are off for your account. Enable “Allow OpenRouter answers for my account” in OMS Settings → Integrations → Telegram. No account data was sent to AI.',
  save:'Save my preferences', saved:'Your phone notification preferences were saved.', unsaved:'Unsaved changes',
};
type Copy = typeof en;
const ru: Copy = {
  account:'Связанный аккаунт OMS',telegramId:'ID пользователя Telegram',approvalTitle:'Подтвердите свой аккаунт Telegram',
  approvalHint:'Нажмите Start в Telegram и вернитесь сюда. Подтверждайте только свой аккаунт Telegram. Не передавайте ссылку подключения другим людям.',
  identityCheck:'Это мой аккаунт Telegram',approve:'Подтвердить и подключить',confirmed:'Telegram привязан к вашему аккаунту OMS.',
  approvalExpired:'Подтверждение истекло или уже использовано. Обновите статус и создайте новую ссылку.',
  companyDisabled:'Telegram компании отключён или недоступен. Личные настройки и отключение аккаунта по-прежнему доступны.',
  preferences:'Мои уведомления на телефоне',preferencesHint:'Отправляются только уведомления, адресованные вашему аккаунту OMS. Также действуют правила компании и ваши общие настройки уведомлений.',
  categories:{ORDER:'Заказы и производство',CHAT:'Сообщения и упоминания',INVENTORY:'Склад и материалы',SYSTEM:'Системные уведомления'},
  preview:'Содержимое уведомления на телефоне',full:'Показывать подробности',private:'Скрывать подробности — только оповещение',
  privacyHint:'Приватный режим скрывает заголовки и текст автоматических уведомлений. Явно запрошенные команды могут возвращать доступные вам подробности.',
  ai:'Разрешить ответы OpenRouter для моего аккаунта',aiHint:'При использовании /ask соответствующие доступные вам данные OMS передаются настроенному ИИ-провайдеру. Помощник может искать заказы, но не изменять их.',
  aiUnavailable:'Помощник Telegram также должен быть включён в R&D. Личная настройка не включает его для всей компании.',
  aiConsentRequired:'ИИ-ответы отключены для вашего аккаунта. Включите «Разрешить ответы OpenRouter для моего аккаунта» в OMS: Настройки → Интеграции → Telegram. Данные аккаунта не передавались ИИ.',
  save:'Сохранить мои настройки',saved:'Ваши настройки уведомлений на телефоне сохранены.',unsaved:'Есть несохранённые изменения',
};
const lv: Copy = {
  account:'Piesaistītais OMS konts',telegramId:'Telegram lietotāja ID',approvalTitle:'Apstipriniet savu Telegram kontu',
  approvalHint:'Nospiediet Start lietotnē Telegram un atgriezieties šeit. Apstipriniet tikai savu Telegram kontu. Nedalieties ar savienojuma saiti.',
  identityCheck:'Tas ir mans Telegram konts',approve:'Apstiprināt un savienot',confirmed:'Telegram ir piesaistīts jūsu OMS kontam.',
  approvalExpired:'Apstiprinājums ir beidzies vai jau izmantots. Atjaunojiet statusu un izveidojiet jaunu saiti.',
  companyDisabled:'Uzņēmuma Telegram piegāde ir izslēgta vai nav pieejama. Joprojām varat mainīt savus iestatījumus vai atvienot kontu.',
  preferences:'Mani tālruņa paziņojumi',preferencesHint:'Tiek sūtīti tikai jūsu OMS kontam adresētie paziņojumi. Spēkā ir arī uzņēmuma noteikumi un jūsu vispārīgie paziņojumu iestatījumi.',
  categories:{ORDER:'Pasūtījumi un ražošana',CHAT:'Ziņas un pieminējumi',INVENTORY:'Noliktava un materiāli',SYSTEM:'Sistēmas paziņojumi'},
  preview:'Paziņojuma priekšskatījums tālrunī',full:'Rādīt paziņojuma saturu',private:'Slēpt saturu — tikai paziņojums',
  privacyHint:'Privāts priekšskatījums paslēpj automātisko paziņojumu virsrakstus un tekstu. Jūsu pieprasītās komandas joprojām var parādīt jums pieejamo informāciju.',
  ai:'Atļaut OpenRouter atbildes manam kontam',aiHint:'Izmantojot /ask, atbilstošie jums pieejamie OMS ieraksti tiek nosūtīti konfigurētajam MI pakalpojumam. Palīgs var meklēt pasūtījumus, bet nevar tos mainīt.',
  aiUnavailable:'Telegram palīgs jāieslēdz arī R&D iestatījumos. Jūsu izvēle to nevar ieslēgt visam uzņēmumam.',
  aiConsentRequired:'MI atbildes jūsu kontam ir izslēgtas. OMS iestatījumos → Integrācijas → Telegram ieslēdziet “Atļaut OpenRouter atbildes manam kontam”. Konta dati netika nosūtīti MI.',
  save:'Saglabāt manus iestatījumus',saved:'Jūsu tālruņa paziņojumu iestatījumi ir saglabāti.',unsaved:'Nesaglabātas izmaiņas',
};
export function telegramAccountCopy(locale: unknown): Copy { return locale==='ru' ? ru : locale==='lv' ? lv : en; }
