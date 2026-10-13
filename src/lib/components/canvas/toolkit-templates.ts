/** Locale-aware starter cards. Visible copy is captured into a shared board at creation. */
import type { IdeaKind } from './idea-model';

type Template = 'project' | 'options' | 'workshop';
type Seed = [IdeaKind, string, string, number, number];
const templates: Record<'en' | 'ru' | 'lv', Record<Template, Seed[]>> = {
  en: {
    project: [
      ['idea', 'Project vision', 'What are we building and for whom?', 0, 0],
      ['research', 'Constraints', 'Budget, materials, deadlines and unknowns.', 330, 0],
      ['decision', 'Direction', 'Which approach is the best fit? Why?', 660, 0],
      ['task', 'First milestone', 'A small demonstrable result.', 160, 265],
      ['note', 'References', 'Place sketches, images and source notes nearby.', 500, 265]
    ],
    options: [
      ['idea', 'The challenge', 'Describe the problem clearly.', 330, 0],
      ['idea', 'Option A', 'One credible path.', 0, 260],
      ['idea', 'Option B', 'A different path.', 330, 260],
      ['idea', 'Option C', 'An unconventional path.', 660, 260],
      ['decision', 'Evaluation', 'Compare benefits, tradeoffs and risks.', 330, 520]
    ],
    workshop: [
      ['idea', 'Customer need', 'What should this signage or object achieve?', 0, 0],
      ['research', 'Site & measurements', 'Dimensions, conditions, constraints.', 330, 0],
      ['idea', 'Materials & finish', 'Acrylic, metal, illumination, graphics.', 660, 0],
      ['decision', 'Production method', 'Choose based on actual capacity.', 160, 265],
      ['task', 'Prototype', 'Test key assumptions in the workshop.', 500, 265]
    ]
  },
  ru: {
    project: [
      ['idea', 'Цель проекта', 'Что создаём и для кого?', 0, 0],
      ['research', 'Ограничения', 'Бюджет, материалы, сроки и неизвестные.', 330, 0],
      ['decision', 'Выбор направления', 'Какой подход подходит лучше? Почему?', 660, 0],
      ['task', 'Первый этап', 'Небольшой проверяемый результат.', 160, 265],
      ['note', 'Источники', 'Добавьте эскизы, изображения и ссылки.', 500, 265]
    ],
    options: [
      ['idea', 'Задача', 'Чётко опишите проблему.', 330, 0],
      ['idea', 'Вариант А', 'Один реалистичный подход.', 0, 260],
      ['idea', 'Вариант Б', 'Другой способ.', 330, 260],
      ['idea', 'Вариант В', 'Нестандартное решение.', 660, 260],
      ['decision', 'Оценка', 'Сравните плюсы, компромиссы и риски.', 330, 520]
    ],
    workshop: [
      ['idea', 'Потребность клиента', 'Чего должна достичь эта вывеска или конструкция?', 0, 0],
      ['research', 'Место и размеры', 'Габариты, условия и ограничения.', 330, 0],
      ['idea', 'Материалы и отделка', 'Акрил, металл, подсветка, графика.', 660, 0],
      ['decision', 'Способ изготовления', 'Выбирайте с учётом реальных мощностей.', 160, 265],
      ['task', 'Прототип', 'Проверьте основные допущения в мастерской.', 500, 265]
    ]
  },
  lv: {
    project: [
      ['idea', 'Projekta mērķis', 'Ko veidojam un kam tas paredzēts?', 0, 0],
      ['research', 'Ierobežojumi', 'Budžets, materiāli, termiņi un nezināmais.', 330, 0],
      ['decision', 'Virziens', 'Kura pieeja ir piemērotākā un kāpēc?', 660, 0],
      ['task', 'Pirmais posms', 'Neliels, pārbaudāms rezultāts.', 160, 265],
      ['note', 'Atsauces', 'Pievienojiet skices, attēlus un avotus.', 500, 265]
    ],
    options: [
      ['idea', 'Problēma', 'Skaidri aprakstiet uzdevumu.', 330, 0],
      ['idea', 'Variants A', 'Viena ticama pieeja.', 0, 260],
      ['idea', 'Variants B', 'Cits risinājums.', 330, 260],
      ['idea', 'Variants C', 'Netradicionāla pieeja.', 660, 260],
      ['decision', 'Novērtējums', 'Salīdziniet ieguvumus, kompromisus un riskus.', 330, 520]
    ],
    workshop: [
      ['idea', 'Klienta vajadzība', 'Kas jāpanāk ar šo izkārtni vai objektu?', 0, 0],
      ['research', 'Vieta un mērījumi', 'Izmēri, apstākļi un ierobežojumi.', 330, 0],
      ['idea', 'Materiāli un apdare', 'Akrils, metāls, apgaismojums, grafika.', 660, 0],
      ['decision', 'Ražošanas metode', 'Izvēlieties, ņemot vērā reālo kapacitāti.', 160, 265],
      ['task', 'Prototips', 'Pārbaudiet galvenos pieņēmumus darbnīcā.', 500, 265]
    ]
  }
};

export function starterCards(template: Template, locale: string): Seed[] {
  const code = locale === 'ru' || locale === 'lv' ? locale : 'en';
  return templates[code][template].map(card => [...card]);
}
