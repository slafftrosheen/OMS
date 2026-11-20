import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';

export const enPickSkew = {
  top: 'Skew top edge; bottom edge stays fixed', right: 'Skew right edge; left edge stays fixed',
  bottom: 'Skew bottom edge; top edge stays fixed', left: 'Skew left edge; right edge stays fixed',
  rotate: 'Rotate selection', help: 'Click selected curves again to switch handles. Drag an edge to skew, or move the center before rotating. Shift: 15° steps. Escape: cancel. Arrow keys: 1° steps. Enter or double-click an edge: Transformations.',
  limit: 'Angle limit', canceled: 'Skew canceled.', mode: 'Rotate / skew',
};
type Copy = Record<keyof typeof enPickSkew, string>;
const ru: Copy = {
  top: 'Наклонить верхний край; нижний край неподвижен', right: 'Наклонить правый край; левый край неподвижен',
  bottom: 'Наклонить нижний край; верхний край неподвижен', left: 'Наклонить левый край; правый край неподвижен',
  rotate: 'Повернуть выделение', help: 'Повторный щелчок по выбранным кривым переключает ручки. Тяните край для наклона или переместите центр перед поворотом. Shift: шаг 15°. Escape: отмена. Стрелки: шаг 1°. Enter или двойной щелчок по краю: Преобразования.',
  limit: 'Предел угла', canceled: 'Наклон отменён.', mode: 'Поворот / наклон',
};
const lv: Copy = {
  top: 'Sašķiebt augšmalu; apakšmala paliek nekustīga', right: 'Sašķiebt labo malu; kreisā mala paliek nekustīga',
  bottom: 'Sašķiebt apakšmalu; augšmala paliek nekustīga', left: 'Sašķiebt kreiso malu; labā mala paliek nekustīga',
  rotate: 'Pagriezt atlasi', help: 'Atkārtots klikšķis uz atlasītajām līknēm pārslēdz turus. Velciet malu, lai sašķiebtu, vai pārvietojiet centru pirms pagriešanas. Shift: 15° soļi. Escape: atcelt. Bulttaustiņi: 1° soļi. Enter vai dubultklikšķis uz malas: Pārveidojumi.',
  limit: 'Leņķa robeža', canceled: 'Sašķiebšana atcelta.', mode: 'Pagriezt / sašķiebt',
};
const subscribe = (notify: () => void) => locale.subscribe(() => notify());
export function usePickSkewText() {
  const language = useSyncExternalStore(subscribe, () => get(locale), () => get(locale));
  const copy = typeof language === 'string' && language.startsWith('ru') ? ru : typeof language === 'string' && language.startsWith('lv') ? lv : enPickSkew;
  return (key: keyof typeof enPickSkew) => copy[key];
}
