/** A deliberately small text renderer. It produces typed nodes, never HTML. */
export type AssistantInline = { type: 'text' | 'strong' | 'code'; text: string }
  | { type: 'link'; text: string; href: string };
export type AssistantBlock =
  | { type: 'paragraph' | 'heading'; content: AssistantInline[] }
  | { type: 'list'; ordered: boolean; start: number; items: AssistantInline[][] }
  | { type: 'code'; text: string }
  | { type: 'table'; headings: AssistantInline[][]; rows: AssistantInline[][][] };

export function assistantLink(value: string): string | null {
  if (value.length > 1600 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

export function assistantInline(text: string): AssistantInline[] {
  const tokens: AssistantInline[] = [];
  // No nesting, images, HTML, autolinking or embedded media. Unknown syntax is text.
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|(?<!!)\[[^\]\n]+\]\([^\s)]+\))/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index!;
    if (index > end) tokens.push({ type: 'text', text: text.slice(end, index) });
    const value = match[0];
    if (value.startsWith('`')) tokens.push({ type: 'code', text: value.slice(1, -1) });
    else if (value.startsWith('**')) tokens.push({ type: 'strong', text: value.slice(2, -2) });
    else {
      const parts = /^\[([^\]]+)\]\((.+)\)$/.exec(value)!;
      const href = assistantLink(parts[2]);
      tokens.push(href ? { type: 'link', text: parts[1], href } : { type: 'text', text: value });
    }
    end = index + value.length;
  }
  if (end < text.length) tokens.push({ type: 'text', text: text.slice(end) });
  return tokens;
}

const listItem = /^\s{0,3}(?:(\d{1,3})[.)]|[-*+])\s+(.+)$/;
const heading = /^#{1,6}\s+(.+)$/;
const divider = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/)
  .map(value => value.trim().replace(/\\\|/g, '|'));

export function parseAssistantResponse(source: string): AssistantBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').slice(0, 12000).split('\n');
  const blocks: AssistantBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (/^\s*```/.test(line)) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const title = heading.exec(line);
    if (title) { blocks.push({ type: 'heading', content: assistantInline(title[1]) }); index++; continue; }
    if (line.includes('|') && index + 1 < lines.length && divider.test(lines[index + 1])) {
      const headers = cells(line);
      if (headers.length >= 2 && headers.length <= 6 && cells(lines[index + 1]).length === headers.length) {
        const rows: AssistantInline[][][] = [];
        index += 2;
        while (index < lines.length && lines[index].includes('|') && rows.length < 30) {
          const row = cells(lines[index]);
          if (row.length !== headers.length) break;
          rows.push(row.map(assistantInline)); index++;
        }
        blocks.push({ type: 'table', headings: headers.map(assistantInline), rows });
        continue;
      }
    }
    const firstItem = listItem.exec(line);
    if (firstItem) {
      const ordered = firstItem[1] !== undefined;
      const items: AssistantInline[][] = [];
      while (index < lines.length) {
        const item = listItem.exec(lines[index]);
        if (!item || (item[1] !== undefined) !== ordered) break;
        items.push(assistantInline(item[2])); index++;
      }
      blocks.push({ type: 'list', ordered, start: ordered ? Number(firstItem[1]) : 1, items });
      continue;
    }
    const paragraph = [line];
    index++;
    while (index < lines.length && lines[index].trim() && !heading.test(lines[index]) && !listItem.test(lines[index])
      && !/^\s*```/.test(lines[index]) && !(lines[index].includes('|') && divider.test(lines[index + 1] ?? ''))) {
      paragraph.push(lines[index++]);
    }
    blocks.push({ type: 'paragraph', content: assistantInline(paragraph.join('\n')) });
  }
  return blocks;
}
