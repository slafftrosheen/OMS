export const TOOLKIT_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const TOOLKIT_MEDIA_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'
]);
export const TOOLKIT_MEDIA_EXTENSIONS: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4'
};
export function toolkitFileMime(file: Pick<File, 'type' | 'name'>): string {
  const declared = file.type.toLowerCase();
  const aliases: Record<string, string> = { 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg' };
  return !declared || declared === 'application/octet-stream'
    ? TOOLKIT_MEDIA_EXTENSIONS[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
    : aliases[declared] ?? declared;
}
export function toolkitDocumentKind(mime: string): 'pdf' | 'image' | 'video' | 'audio' {
  return mime === 'application/pdf' ? 'pdf' : mime.startsWith('video/') ? 'video'
    : mime.startsWith('audio/') ? 'audio' : 'image';
}
