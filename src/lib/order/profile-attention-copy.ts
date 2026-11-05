import type { ProfileNoteGroup } from './profile-attention';
interface ProfileAttentionCopy {
  readOnly: string;
  index: string;
  goToProfile: string;
  groups: Record<ProfileNoteGroup, string>;
}
const copy: Record<'en' | 'lv' | 'ru', ProfileAttentionCopy> = {
  en: {
    readOnly: 'Read-only specification', index: 'Profiles with notes', goToProfile: 'Go to profile',
    groups: { profile: 'Profile note', CNC_FREZER: 'CNC', BENDER: 'Bending', FRONT: 'Film', PAINTING: 'Painting', ASSEMBLING: 'Assembly' }
  },
  lv: {
    readOnly: 'Specifikācija tikai lasīšanai', index: 'Profili ar piezīmēm', goToProfile: 'Atvērt profilu',
    groups: { profile: 'Profila piezīme', CNC_FREZER: 'CNC', BENDER: 'Locīšana', FRONT: 'Plēve', PAINTING: 'Krāsošana', ASSEMBLING: 'Montāža' }
  },
  ru: {
    readOnly: 'Спецификация только для чтения', index: 'Профили с примечаниями', goToProfile: 'Перейти к профилю',
    groups: { profile: 'Примечание к профилю', CNC_FREZER: 'ЧПУ', BENDER: 'Гибка', FRONT: 'Плёнка', PAINTING: 'Покраска', ASSEMBLING: 'Сборка' }
  }
};
export function profileAttentionCopy(locale: string | null | undefined): ProfileAttentionCopy {
  const language = locale?.toLowerCase().split(/[-_]/)[0];
  return copy[language === 'lv' || language === 'ru' ? language : 'en'];
}
