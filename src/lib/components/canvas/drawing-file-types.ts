const fileMime = {
  dxf: ['application/dxf', 'application/x-dxf', 'image/vnd.dxf'],
  pdf: ['application/pdf'],
  svg: ['image/svg+xml'],
  eps: ['application/postscript', 'application/eps', 'image/eps', 'image/x-eps'],
  cdr: ['application/vnd.corel-draw', 'application/coreldraw', 'application/x-coreldraw'],
} as const;

export type DrawingFileKind = keyof typeof fileMime;
const kinds = Object.keys(fileMime) as DrawingFileKind[];
const accept = (types: readonly DrawingFileKind[]) =>
  types.flatMap(kind => [`.${kind}`, ...fileMime[kind]]).join(',');

export const DRAWING_FILE_ACCEPT = accept(kinds);
export const VECTOR_FILE_ACCEPT = accept(kinds.filter(kind => kind !== 'dxf'));
export const DXF_FILE_ACCEPT = accept(['dxf']);

export function drawingFileKind(file?: Pick<File, 'name' | 'type'>): DrawingFileKind | undefined {
  if (!file) return undefined;
  const extension = /\.([a-z]+)$/i.exec(file.name.trim())?.[1].toLowerCase();
  if (extension && Object.hasOwn(fileMime, extension)) return extension as DrawingFileKind;
  const mime = file.type.toLowerCase().split(';')[0].trim();
  return kinds.find(kind => (fileMime[kind] as readonly string[]).includes(mime));
}
