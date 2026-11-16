import { useSyncExternalStore } from 'react';
import { get } from 'svelte/store';
import { locale } from 'svelte-i18n';
const en = {
  title:'Solid fill', colour:'Fill colour', none:'No fill', apply:'Apply fill', applied:'Fill applied.',
  help:'Select one closed CAD object. Apply replaces its gradient or material with a solid colour and preserves the outline.',
  failed:'The fill could not be applied. Check the selection and try again.',
};
type Key=keyof typeof en;
const ru:Record<Key,string>={
  title:'Однородная заливка',colour:'Цвет заливки',none:'Без заливки',apply:'Применить заливку',applied:'Заливка применена.',
  help:'Выберите один замкнутый CAD-объект. Применение заменяет градиент или материал сплошным цветом и сохраняет контур.',
  failed:'Не удалось применить заливку. Проверьте выделение и повторите.',
};
const lv:Record<Key,string>={
  title:'Vienkrāsains aizpildījums',colour:'Aizpildījuma krāsa',none:'Bez aizpildījuma',apply:'Lietot aizpildījumu',applied:'Aizpildījums lietots.',
  help:'Atlasiet vienu slēgtu CAD objektu. Lietošana aizstāj gradientu vai materiālu ar vienkrāsainu aizpildījumu un saglabā kontūru.',
  failed:'Aizpildījumu neizdevās lietot. Pārbaudiet atlasi un mēģiniet vēlreiz.',
};
const subscribe=(notify:()=>void)=>locale.subscribe(()=>notify());
export function useSolidFillText(){
  const lang=useSyncExternalStore(subscribe,()=>get(locale),()=>get(locale));
  const copy=lang?.startsWith('ru')?ru:lang?.startsWith('lv')?lv:en;
  return (key:Key)=>copy[key];
}
