const en = {
  title: 'Models', text: 'Text & assistant model', vision: 'Vision / order OCR model',
  textHint: 'Used for chat and assistant tools.',
  visionHint: 'Used for images and scanned PDF drawings. Requires image input and structured JSON output.',
  cost: 'Free models are listed first. Paid models use your OpenRouter balance.',
  free: 'Free', paid: 'Paid', save: 'Save models', saving: 'Saving models…',
  loading: 'Loading available models…', reload: 'Reload models',
  saved: 'Models saved. New AI requests use these selections immediately.',
  unavailable: 'Could not load model settings. Retry shortly.',
  incompatible: 'The current vision model is unavailable or does not support structured JSON. Choose a compatible model below.',
  current: 'Current selection'
};
type Copy = typeof en;
const ru: Copy = {
  title: 'Модели', text: 'Модель текста и ассистента', vision: 'Модель изображений и OCR заказов',
  textHint: 'Используется для чата и инструментов ассистента.',
  visionHint: 'Используется для изображений и сканированных PDF-чертежей. Требуется поддержка изображений и структурированного JSON.',
  cost: 'Сначала показаны бесплатные модели. Платные используют баланс OpenRouter.',
  free: 'Бесплатная', paid: 'Платная', save: 'Сохранить модели', saving: 'Сохранение моделей…',
  loading: 'Загрузка доступных моделей…', reload: 'Обновить модели',
  saved: 'Модели сохранены. Новые запросы ИИ сразу используют выбранные модели.',
  unavailable: 'Не удалось загрузить настройки моделей. Повторите попытку.',
  incompatible: 'Текущая модель изображений недоступна или не поддерживает структурированный JSON. Выберите совместимую модель ниже.',
  current: 'Текущий выбор'
};
const lv: Copy = {
  title: 'Modeļi', text: 'Teksta un asistenta modelis', vision: 'Attēlu un pasūtījumu OCR modelis',
  textHint: 'Izmanto čatam un asistenta rīkiem.',
  visionHint: 'Izmanto attēliem un skenētiem PDF rasējumiem. Nepieciešama attēlu ievade un strukturēta JSON izvade.',
  cost: 'Vispirms parādīti bezmaksas modeļi. Maksas modeļi izmanto OpenRouter konta atlikumu.',
  free: 'Bezmaksas', paid: 'Maksas', save: 'Saglabāt modeļus', saving: 'Saglabā modeļus…',
  loading: 'Ielādē pieejamos modeļus…', reload: 'Atjaunot modeļus',
  saved: 'Modeļi saglabāti. Jaunie MI pieprasījumi uzreiz izmanto izvēlētos modeļus.',
  unavailable: 'Neizdevās ielādēt modeļu iestatījumus. Mēģiniet vēlreiz.',
  incompatible: 'Pašreizējais attēlu modelis nav pieejams vai neatbalsta strukturētu JSON. Tālāk izvēlieties saderīgu modeli.',
  current: 'Pašreizējā izvēle'
};
export function openRouterModelCopy(locale: unknown): Copy {return locale === 'ru' ? ru : locale === 'lv' ? lv : en;}
