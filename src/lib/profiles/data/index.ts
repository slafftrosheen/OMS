// src/lib/profiles/data/index.ts
import aluminum from './aluminum-materials.json';
import oracal8500 from './oracal-8500.json';
import pantone from './pantone-solid-coated.json';
import plexiglas from './plexiglas-materials.json';
import pvc from './pvc-foam-materials.json';
import ral from './ral-classic.json';

export const materialsData = {
  aluminum,
  oracal8500,
  pantone,
  plexiglas,
  pvc,
  ral
};

export {
  aluminum as aluminumMaterials,
  oracal8500 as oracalColors,
  pantone as pantoneColors,
  plexiglas as plexiglasMaterials,
  pvc as pvcMaterials,
  ral as ralColors
};
