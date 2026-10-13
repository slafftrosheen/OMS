/** A user preference, not a property inferred from prompt text or board content. */
export type ResponseLocale = 'en' | 'ru' | 'lv';

const LANGUAGE_NAMES: Record<ResponseLocale, string> = {
  en: 'English',
  ru: 'Russian',
  lv: 'Latvian'
};

export function normalizeResponseLocale(value: unknown): ResponseLocale | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toLowerCase().split(/[-_]/)[0];
  return code === 'en' || code === 'ru' || code === 'lv' ? code : null;
}

export function resolveResponseLocale(
  requested: unknown,
  saved: unknown,
  acceptLanguage?: string | null
): ResponseLocale {
  const accepted = acceptLanguage?.split(',').map(part => {
    const [tag, q] = part.trim().split(';q=');
    return { locale: normalizeResponseLocale(tag), weight: q === undefined ? 1 : Number(q) };
  }).filter(item => item.locale && Number.isFinite(item.weight) && item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  return normalizeResponseLocale(requested)
    ?? normalizeResponseLocale(saved)
    ?? accepted?.[0]?.locale
    ?? 'en';
}

export function responseLanguageInstruction(code: ResponseLocale): string {
  return `The user has explicitly selected ${LANGUAGE_NAMES[code]} (locale ${code}) in OMS settings.
Always write all user-facing text in ${LANGUAGE_NAMES[code]}, regardless of the language of
the user's question, earlier messages, stored project content, tool descriptions or sources.
This includes explanations, questions, generated card titles and bodies, proposed-action
reasons, summaries and final answers. Do not translate technical identifiers, URLs,
function names, code, model names or proper nouns. Never claim that the preference
was inferred from text. Only an explicit request to change the response language
in the user's current message may override this setting for that response.`;
}
