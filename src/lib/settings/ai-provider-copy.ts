const en = {
  routing: 'AI provider and OpenAI API', provider: 'Active provider',
  explanation: 'The active provider handles the OMS assistant, Canvas and order analysis when company sharing is enabled.',
  migration: 'Apply the OMS AI provider migration to enable editing.',
  keyStatus: 'OpenAI API key', configured: 'Configured', missing: 'Missing',
  environment: 'Server environment', key: 'New OpenAI API key',
  removeKey: 'Remove the stored key on save', textModel: 'OpenAI text and tools model', visionModel: 'OpenAI vision model',
  save: 'Save provider settings', saving: 'Saving…', saved: 'AI provider settings saved.',
  invalid: 'Check the model IDs and API key.', failed: 'Could not save provider settings.',
  subscription: 'ChatGPT subscription',
  subscriptionStatus: 'ChatGPT plan usage for this shared OMS server requires OpenAI partner approval.',
  partnerLink: 'OpenAI partner access',
};
const lv: typeof en = {
  routing: 'MI pakalpojums un OpenAI API', provider: 'Aktīvais pakalpojums',
  explanation: 'Ja uzņēmums atļauj datu koplietošanu, aktīvais pakalpojums apkalpo OMS palīgu, zīmējumus un pasūtījumu analīzi.',
  migration: 'Lai rediģētu iestatījumus, piemērojiet OMS MI pakalpojuma datubāzes migrāciju.',
  keyStatus: 'OpenAI API atslēga', configured: 'Iestatīta', missing: 'Nav iestatīta',
  environment: 'Servera vide', key: 'Jauna OpenAI API atslēga',
  removeKey: 'Saglabājot dzēst saglabāto atslēgu', textModel: 'OpenAI teksta un rīku modelis', visionModel: 'OpenAI attēlu modelis',
  save: 'Saglabāt pakalpojuma iestatījumus', saving: 'Saglabā…', saved: 'MI pakalpojuma iestatījumi saglabāti.',
  invalid: 'Pārbaudiet modeļu ID un API atslēgu.', failed: 'Neizdevās saglabāt pakalpojuma iestatījumus.',
  subscription: 'ChatGPT abonements',
  subscriptionStatus: 'Lai koplietotajā OMS serverī izmantotu ChatGPT plānu, vajadzīgs OpenAI partnera apstiprinājums.',
  partnerLink: 'OpenAI partneru piekļuve',
};
const ru: typeof en = {
  routing: 'Провайдер ИИ и OpenAI API', provider: 'Активный провайдер',
  explanation: 'Если обмен данными разрешён, активный провайдер обслуживает помощника OMS, холсты и анализ заказов.',
  migration: 'Для редактирования примените миграцию провайдера ИИ в базе данных OMS.',
  keyStatus: 'Ключ OpenAI API', configured: 'Настроен', missing: 'Отсутствует',
  environment: 'Переменная сервера', key: 'Новый ключ OpenAI API',
  removeKey: 'Удалить сохранённый ключ при сохранении', textModel: 'Модель OpenAI для текста и инструментов', visionModel: 'Модель OpenAI для изображений',
  save: 'Сохранить настройки провайдера', saving: 'Сохранение…', saved: 'Настройки провайдера сохранены.',
  invalid: 'Проверьте ID моделей и ключ API.', failed: 'Не удалось сохранить настройки провайдера.',
  subscription: 'Подписка ChatGPT',
  subscriptionStatus: 'Использование подписки ChatGPT на общем сервере OMS требует партнёрского одобрения OpenAI.',
  partnerLink: 'Партнёрский доступ OpenAI',
};
export function aiProviderCopy(locale: string | null | undefined) {
  return locale?.startsWith('lv') ? lv : locale?.startsWith('ru') ? ru : en;
}
