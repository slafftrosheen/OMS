import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

const en = {
  title: 'Machine time estimate', help: 'Path length ÷ feed, plus one pierce per contour and a travel allowance. A planning figure for quotes and the schedule, not a cycle time.',
  machine: 'Machine', co2: 'CO₂ laser', fibre: 'Fibre laser', router: 'CNC router', plotter: 'Cutting plotter',
  feedCut: 'Cut feed, mm/min', feedEngrave: 'Engrave feed, mm/min', feedScore: 'Score / bend feed, mm/min',
  pierce: 'Pierce or plunge, s', travel: 'Travel allowance, %', copies: 'Copies', reset: 'Reset to machine defaults',
  layer: 'Layer', operation: 'Operation', cut: 'Cut', engrave: 'Engrave', score: 'Score / bend', skip: 'Not machined',
  pierces: 'Pierces', length: 'Length', time: 'Time', total: 'Estimated machine time', motion: 'Cutting', piercing: 'Piercing', travelTime: 'Travel and lead-ins',
  unknown: 'Unknown — length limit reached', invalid: 'Check the machine values: feeds above 0, pierce 0–60 s, travel 0–200 %.',
  perCopy: '{time} per copy', saved: 'Your machine values are remembered on this device.'
};
type Label = keyof typeof en;
const lv: Record<Label, string> = {
  title: 'Iekārtas laika aprēķins', help: 'Ceļa garums ÷ padeve, plus viena caurduršana katrai kontūrai un pārvietošanās rezerve. Plānošanas skaitlis tāmēm un grafikam, nevis cikla laiks.',
  machine: 'Iekārta', co2: 'CO₂ lāzers', fibre: 'Šķiedras lāzers', router: 'CNC frēze', plotter: 'Griešanas plotters',
  feedCut: 'Griešanas padeve, mm/min', feedEngrave: 'Gravēšanas padeve, mm/min', feedScore: 'Rievošanas / locīšanas padeve, mm/min',
  pierce: 'Caurduršana vai iegremdēšana, s', travel: 'Pārvietošanās rezerve, %', copies: 'Eksemplāri', reset: 'Atjaunot iekārtas noklusējumus',
  layer: 'Slānis', operation: 'Operācija', cut: 'Griešana', engrave: 'Gravēšana', score: 'Rievošana / locīšana', skip: 'Netiek apstrādāts',
  pierces: 'Caurduršanas', length: 'Garums', time: 'Laiks', total: 'Aprēķinātais iekārtas laiks', motion: 'Griešana', piercing: 'Caurduršana', travelTime: 'Pārvietošanās un ieejas',
  unknown: 'Nezināms — sasniegts garuma limits', invalid: 'Pārbaudiet iekārtas vērtības: padeve virs 0, caurduršana 0–60 s, rezerve 0–200 %.',
  perCopy: '{time} vienam eksemplāram', saved: 'Jūsu iekārtas vērtības tiek atcerētas šajā ierīcē.'
};
const ru: Record<Label, string> = {
  title: 'Оценка машинного времени', help: 'Длина пути ÷ подача, плюс одна врезка на контур и запас на холостые ходы. Ориентир для расчёта цены и графика, а не время цикла.',
  machine: 'Станок', co2: 'CO₂-лазер', fibre: 'Волоконный лазер', router: 'Фрезер ЧПУ', plotter: 'Режущий плоттер',
  feedCut: 'Подача резки, мм/мин', feedEngrave: 'Подача гравировки, мм/мин', feedScore: 'Подача биговки / гиба, мм/мин',
  pierce: 'Врезка или погружение, с', travel: 'Запас на холостые ходы, %', copies: 'Копий', reset: 'Вернуть значения станка',
  layer: 'Слой', operation: 'Операция', cut: 'Резка', engrave: 'Гравировка', score: 'Биговка / гиб', skip: 'Не обрабатывается',
  pierces: 'Врезки', length: 'Длина', time: 'Время', total: 'Расчётное машинное время', motion: 'Резка', piercing: 'Врезки', travelTime: 'Холостые ходы и подводы',
  unknown: 'Неизвестно — достигнут предел расчёта длины', invalid: 'Проверьте значения: подача больше 0, врезка 0–60 с, запас 0–200 %.',
  perCopy: '{time} на копию', saved: 'Ваши значения станка сохраняются на этом устройстве.'
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function useCutEstimateText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const lang: 'en' | 'lv' | 'ru' = language?.startsWith('ru') ? 'ru' : language?.startsWith('lv') ? 'lv' : 'en';
  const copy = lang === 'ru' ? ru : lang === 'lv' ? lv : en;
  const label = (key: Label, values?: Record<string, string | number>) =>
    values ? copy[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? '')) : copy[key];
  return { label, lang };
}
export const cutEstimateCopy = { en, lv, ru };
