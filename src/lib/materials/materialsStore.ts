import { writable, derived } from 'svelte/store';

export type Material = {
  id: string;
  category: string;
  code: string;
  name_en: string;
  name_ru?: string;
  name_lv?: string;
  thickness_options: number[];
  metadata: Record<string, any>;
};

function createMaterialsStore() {
  const { subscribe, set, update } = writable<Material[]>([]);

  return {
    subscribe,
    load: async () => {
      try {
        const res = await fetch('/api/materials');
        if (res.ok) {
          const data = await res.json();
          set(data);
        }
      } catch (e) {
        console.error('Failed to load materials', e);
      }
    },
    getByCategory: (category: string) => {
        return derived({ subscribe }, $materials =>
            $materials.filter(m => m.category === category)
        );
    }
  };
}

export const materials = createMaterialsStore();
