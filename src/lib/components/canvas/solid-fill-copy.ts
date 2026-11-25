import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
const en = {
  catalog:'Catalog paint', searchPaint:'Search paint code or name', loading:'Loading paints…', noPaint:'No matching paint swatches.', loadFailed:'Could not load paints. Reopen the catalog to retry.',
  title:'Solid fill', colour:'Fill colour', none:'No fill', apply:'Apply fill', applied:'Fill applied.',
  help:'Select one closed CAD object. Apply replaces its gradient or material with a solid colour and preserves the outline.',
  failed:'The fill could not be applied. Check the selection and try again.',
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
  catalog:'Краска из каталога', searchPaint:'Поиск по коду или названию', loading:'Загрузка красок…', noPaint:'Подходящие образцы не найдены.', loadFailed:'Не удалось загрузить краски. Откройте каталог ещё раз.',
  title:'Однородная заливка',colour:'Цвет заливки',none:'Без заливки',apply:'Применить заливку',applied:'Заливка применена.',
  help:'Выберите один замкнутый CAD-объект. Применение заменяет градиент или материал сплошным цветом и сохраняет контур.',
  failed:'Не удалось применить заливку. Проверьте выделение и повторите.',
};
const lv:Record<Key,string>={
  catalog:'Krāsa no kataloga', searchPaint:'Meklēt pēc koda vai nosaukuma', loading:'Ielādē krāsas…', noPaint:'Atbilstoši krāsu paraugi nav atrasti.', loadFailed:'Krāsas neizdevās ielādēt. Atveriet katalogu vēlreiz.',
  title:'Vienkrāsains aizpildījums',colour:'Aizpildījuma krāsa',none:'Bez aizpildījuma',apply:'Lietot aizpildījumu',applied:'Aizpildījums lietots.',
  help:'Atlasiet vienu slēgtu CAD objektu. Lietošana aizstāj gradientu vai materiālu ar vienkrāsainu aizpildījumu un saglabā kontūru.',
  failed:'Aizpildījumu neizdevās lietot. Pārbaudiet atlasi un mēģiniet vēlreiz.',
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useSolidFillText(){
  const lang=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));
  const copy=lang?.startsWith('ru')?ru:lang?.startsWith('lv')?lv:en;
  return { lang, t: (key:Key)=>copy[key] };
}
