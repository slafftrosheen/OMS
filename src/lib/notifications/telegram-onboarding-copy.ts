/** Pairing instructions shared by the app, browser and manual launch paths. */
const en = {
  title: 'Complete your Telegram connection',
  instructions: 'Use Telegram Web on this computer, open the Telegram app, or scan the QR code with your phone. Press Start in the bot chat, then return here to confirm your account.',
  openWeb: 'Open Telegram Web',
  openApp: 'Open Telegram app',
  launchHint: 'No app opens, or the browser reports “tg:// … no registered handler”? Use Telegram Web instead. That message is not a bot-token error.',
  manualTitle: 'Connect manually instead',
  manualBefore: 'In Telegram, search for',
  manualAfter: 'and send the entire command below in a private chat. Then return here to confirm your account. Sending /start without the code does not link OMS.',
  commandLabel: 'One-time connection command',
  copyCommand: 'Copy command',
  copied: 'Command copied. Send it privately to the bot, then return to OMS.',
  manualCopy: 'Automatic copying is unavailable. Copy the selected command manually with Ctrl+C / Cmd+C, or touch and hold on your phone.',
  secretHint: 'Do not share this command or a screenshot containing it. It expires together with the connection link.'
};
type Copy = typeof en;
const ru: Copy = {
  title: 'Завершите подключение Telegram',
  instructions: 'Откройте Telegram Web на этом компьютере, приложение Telegram или отсканируйте QR-код телефоном. Нажмите Start в чате с ботом, затем вернитесь сюда и подтвердите свой аккаунт.',
  openWeb: 'Открыть Telegram Web',
  openApp: 'Открыть приложение Telegram',
  launchHint: 'Приложение не открывается или браузер сообщает «tg:// … no registered handler»? Используйте Telegram Web. Это сообщение не означает ошибку токена бота.',
  manualTitle: 'Подключить вручную',
  manualBefore: 'Найдите в Telegram бота',
  manualAfter: 'и отправьте ему в личный чат всю команду ниже. Затем вернитесь сюда и подтвердите свой аккаунт. Команда /start без кода не привязывает аккаунт OMS.',
  commandLabel: 'Одноразовая команда подключения',
  copyCommand: 'Копировать команду',
  copied: 'Команда скопирована. Отправьте её боту в личный чат и вернитесь в OMS.',
  manualCopy: 'Автоматическое копирование недоступно. Скопируйте выделенную команду вручную: Ctrl+C / Cmd+C или долгим нажатием на телефоне.',
  secretHint: 'Не передавайте эту команду или скриншот с ней другим людям. Срок действия совпадает со сроком действия ссылки подключения.'
};
const lv: Copy = {
  title: 'Pabeidziet Telegram savienošanu',
  instructions: 'Šajā datorā atveriet Telegram Web, atveriet Telegram lietotni vai ar tālruni noskenējiet QR kodu. Bota sarunā nospiediet Start, tad atgriezieties šeit un apstipriniet savu kontu.',
  openWeb: 'Atvērt Telegram Web',
  openApp: 'Atvērt Telegram lietotni',
  launchHint: 'Lietotne neatveras vai pārlūks ziņo “tg:// … no registered handler”? Izmantojiet Telegram Web. Šis ziņojums nenozīmē bota piekļuves atslēgas kļūdu.',
  manualTitle: 'Savienot manuāli',
  manualBefore: 'Telegram meklējiet botu',
  manualAfter: 'un privātā sarunā nosūtiet visu tālāk norādīto komandu. Tad atgriezieties šeit un apstipriniet savu kontu. Komanda /start bez koda nepiesaista OMS kontu.',
  commandLabel: 'Vienreizēja savienošanas komanda',
  copyCommand: 'Kopēt komandu',
  copied: 'Komanda nokopēta. Nosūtiet to botam privāti un atgriezieties OMS.',
  manualCopy: 'Automātiskā kopēšana nav pieejama. Kopējiet atlasīto komandu manuāli ar Ctrl+C / Cmd+C vai pieskaroties un turot tālrunī.',
  secretHint: 'Nedalieties ar šo komandu vai tās ekrānuzņēmumu. Tās derīguma termiņš beidzas reizē ar savienošanas saites derīguma termiņu.'
};
export function telegramOnboardingCopy(locale: unknown): Copy {
  return locale === 'ru' ? ru : locale === 'lv' ? lv : en;
}
