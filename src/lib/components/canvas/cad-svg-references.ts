const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function svgLocalFragment(value: string | null | undefined) {
  const encoded = /^#([^\s#]+)$/.exec(value?.trim() ?? '')?.[1];
  if (!encoded) return undefined;
  try {
    const id = decodeURIComponent(encoded);
    return /^[^\s#]+$/.test(id) ? id : undefined;
  } catch {
    // An unescaped percent sign can still be part of a local XML ID.
    return encoded;
  }
}

export const svgHref = (element: Element) => element.getAttribute('href') ?? element.getAttributeNS(XLINK_NS, 'href');
