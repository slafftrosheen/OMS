/** User-facing R&D and general settings navigation. Keep keys aligned. */
const en = {
  "tabsLabel": "Settings sections",
  "general": "General",
  "ai": "AI & OpenRouter",
  "telegram": "Telegram · R&D",
  "integrations": "Integrations & account",
  "sharingTitle": "Allow OMS to send data to OpenRouter",
  "sharingHint": "Company-wide R&D permission for external AI requests. Enables sending relevant order, file and screen data to configured OpenRouter providers. Staff still review all proposed changes; paid OCR requires separate confirmation. Disable to block new transmissions immediately.",
  "sharingLoading": "Loading company policy…",
  "sharingSaving": "Saving sharing policy…",
  "sharingUnavailable": "Company policy unavailable. Apply the OpenRouter policy migration before enabling AI.",
  "sharingSaveFailed": "Could not save the company policy. No permission was changed.",
  "sharingEnabled": "OpenRouter data sharing enabled across OMS.",
  "sharingDisabled": "OpenRouter data sharing disabled across OMS."
};
type Copy = typeof en;
const ru: Copy = {
  "tabsLabel": "Разделы настроек",
  "general": "Основные",
  "ai": "ИИ и OpenRouter",
  "telegram": "Telegram · R&D",
  "integrations": "Интеграции и аккаунт",
  "sharingTitle": "Разрешить OMS отправлять данные в OpenRouter",
  "sharingHint": "Глобальное разрешение R&D для внешнего ИИ. Включает передачу необходимых данных заказов, файлов и экранов провайдерам OpenRouter. Изменения ИИ по-прежнему проверяются сотрудниками; платный OCR подтверждается отдельно. Отключение сразу блокирует новые запросы.",
  "sharingLoading": "Загрузка политики компании…",
  "sharingSaving": "Сохранение политики передачи данных…",
  "sharingUnavailable": "Политика компании недоступна. Примените миграцию OpenRouter перед включением ИИ.",
  "sharingSaveFailed": "Не удалось сохранить политику компании. Разрешение не изменено.",
  "sharingEnabled": "Передача данных в OpenRouter разрешена для OMS.",
  "sharingDisabled": "Передача данных в OpenRouter отключена для OMS."
};
const lv: Copy = {
  "tabsLabel": "Iestatījumu sadaļas",
  "general": "Vispārīgie",
  "ai": "MI un OpenRouter",
  "telegram": "Telegram · R&D",
  "integrations": "Integrācijas un konts",
  "sharingTitle": "Atļaut OMS sūtīt datus uz OpenRouter",
  "sharingHint": "R&D pārvaldīta uzņēmuma atļauja ārējiem MI pieprasījumiem. Tiek sūtīti nepieciešamie pasūtījumu, failu un ekrānu dati OpenRouter pakalpojumu sniedzējiem. Darbinieki joprojām pārskata izmaiņu ieteikumus; maksas OCR jāapstiprina atsevišķi. Izslēgšana nekavējoties aptur jaunus pieprasījumus.",
  "sharingLoading": "Ielādē uzņēmuma politiku…",
  "sharingSaving": "Saglabā datu kopīgošanas politiku…",
  "sharingUnavailable": "Uzņēmuma politika nav pieejama. Pirms MI ieslēgšanas pielietojiet OpenRouter migrāciju.",
  "sharingSaveFailed": "Neizdevās saglabāt uzņēmuma politiku. Atļauja nav mainīta.",
  "sharingEnabled": "OpenRouter datu kopīgošana OMS ir ieslēgta.",
  "sharingDisabled": "OpenRouter datu kopīgošana OMS ir izslēgta."
};
export function settingsTabsCopy(locale: unknown): Copy { return locale === 'ru' ? ru : locale === 'lv' ? lv : en; }
