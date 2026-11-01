import type { ShiftDraftStatus } from './entry-guidance';

interface EntryGuidanceCopy {
  reuse: string;
  discard: string;
  hints: Record<ShiftDraftStatus, string>;
}
const copy: Record<'en' | 'lv' | 'ru', EntryGuidanceCopy> = {
  en: {
    reuse: 'Reuse previous shift', discard: 'Discard edits',
    hints: {
      unavailable: 'Load this day before entering working times.',
      busy: 'An action is in progress. Your current values are kept.',
      future: 'Choose today or an earlier date to record completed work.',
      absence: 'This date has a full-day absence. Update the absence before recording work.',
      startRequired: 'Enter the time you started work.', finishRequired: 'Now enter the time you finished work.',
      invalid: 'Correct the start and finish times before saving.',
      noteTooLong: 'Shorten the note to 500 characters before saving.',
      ready: 'Check the calculated hours, then save. Nothing is saved automatically.',
      unchanged: 'These values match the saved entry.'
    }
  },
  lv: {
    reuse: 'Izmantot iepriekšējās maiņas laikus', discard: 'Atmest izmaiņas',
    hints: {
      unavailable: 'Pirms darba laika ievadīšanas ielādējiet šīs dienas datus.',
      busy: 'Notiek darbība. Pašreizējās ievadītās vērtības tiek saglabātas formā.',
      future: 'Lai reģistrētu paveikto darbu, izvēlieties šodienu vai agrāku datumu.',
      absence: 'Šajā datumā ir pilnas dienas prombūtne. Pirms darba laika reģistrēšanas mainiet prombūtni.',
      startRequired: 'Ievadiet darba sākuma laiku.', finishRequired: 'Tagad ievadiet darba beigu laiku.',
      invalid: 'Pirms saglabāšanas izlabojiet sākuma un beigu laiku.',
      noteTooLong: 'Pirms saglabāšanas saīsiniet piezīmi līdz 500 rakstzīmēm.',
      ready: 'Pārbaudiet aprēķinātās stundas un saglabājiet. Automātiska saglabāšana nenotiek.',
      unchanged: 'Šīs vērtības atbilst saglabātajam ierakstam.'
    }
  },
  ru: {
    reuse: 'Повторить время прошлой смены', discard: 'Отменить изменения',
    hints: {
      unavailable: 'Загрузите данные за день перед вводом рабочего времени.',
      busy: 'Выполняется действие. Введённые значения остаются в форме.',
      future: 'Для учёта выполненной работы выберите сегодняшний или более ранний день.',
      absence: 'На этот день отмечено отсутствие на весь день. Измените его перед вводом рабочего времени.',
      startRequired: 'Укажите время начала работы.', finishRequired: 'Теперь укажите время окончания работы.',
      invalid: 'Исправьте время начала и окончания перед сохранением.',
      noteTooLong: 'Перед сохранением сократите примечание до 500 символов.',
      ready: 'Проверьте рассчитанные часы и сохраните. Автоматического сохранения нет.',
      unchanged: 'Эти значения совпадают с сохранённой записью.'
    }
  }
};
export function entryGuidanceCopy(locale: string | null | undefined): EntryGuidanceCopy {
  const language = locale?.toLowerCase().split(/[-_]/)[0];
  return copy[language === 'lv' || language === 'ru' ? language : 'en'];
}
