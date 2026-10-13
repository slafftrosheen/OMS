import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeResponseLocale, resolveResponseLocale, responseLanguageInstruction
} from '../../src/lib/server/ai/response-language';
import { starterCards } from '../../src/lib/components/canvas/toolkit-templates';

const read = (path: string) => readFileSync(path, 'utf8');
const locale = (code: string) => JSON.parse(read(`src/locales/${code}.json`));

function paths(object: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? paths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  ).sort();
}

describe('OMS language selection and AI output contract', () => {
  it('normalizes the three supported locales including region suffixes', () => {
    expect(normalizeResponseLocale('lv-LV')).toBe('lv');
    expect(normalizeResponseLocale('ru_RU')).toBe('ru');
    expect(normalizeResponseLocale('en-US')).toBe('en');
    expect(normalizeResponseLocale('de')).toBeNull();
    expect(normalizeResponseLocale({ locale: 'ru' })).toBeNull();
  });

  it('prefers current explicit selection over persisted or input languages', () => {
    expect(resolveResponseLocale('ru', 'lv', 'en-US,en;q=0.8')).toBe('ru');
    expect(resolveResponseLocale(undefined, 'lv', 'ru-RU')).toBe('lv');
    expect(resolveResponseLocale(undefined, null, 'de-DE,lv-LV;q=0.9,ru;q=0.5')).toBe('lv');
    expect(resolveResponseLocale('invalid', undefined, null)).toBe('en');
  });

  it('provides an unambiguous model instruction for every response locale', () => {
    for (const [code, name] of [['en', 'English'], ['ru', 'Russian'], ['lv', 'Latvian']] as const) {
      const instruction = responseLanguageInstruction(code);
      expect(instruction).toContain(name);
      expect(instruction).toContain('user-facing text');
      expect(instruction).toContain('card titles and bodies');
    }
  });

  it('keeps all Toolkit translation keys in parity across EN/RU/LV', () => {
    const reference = paths(locale('en').toolkit);
    expect(reference.length).toBeGreaterThan(250);
    for (const code of ['ru', 'lv']) {
      expect(paths(locale(code).toolkit)).toEqual(reference);
    }
  });

  it('generates translated starter-card content without changing geometry or types', () => {
    for (const name of ['project', 'options', 'workshop'] as const) {
      const en = starterCards(name, 'en');
      expect(en).toHaveLength(5);
      for (const code of ['ru', 'lv']) {
        const translated = starterCards(name, code);
        expect(translated.map(card => [card[0], card[3], card[4]]))
          .toEqual(en.map(card => [card[0], card[3], card[4]]));
        expect(translated[0][1]).not.toBe(en[0][1]);
      }
    }
  });

  it('wires the active locale into both AI request paths and user preference validation', () => {
    expect(read('src/routes/toolkit/chat/+page.svelte')).toContain('language: $locale');
    expect(read('src/routes/toolkit/canvas/+page.svelte')).toContain('skill: requestedSkill, language: $locale');
    expect(read('src/routes/api/toolkit/brainstorm/+server.ts')).toContain('responseLanguageInstruction(responseLocale)');
    expect(read('src/routes/api/ai/sessions/[id]/messages/+server.ts')).toContain('responseLanguageInstruction(responseLocale)');
    expect(read('src/routes/api/preferences/+server.ts')).toContain("['en', 'ru', 'lv'].includes(data.locale)");
  });

  it('localizes React canvas shape controls without translating internal enum values', () => {
    const bridge = read('src/lib/components/canvas/use-toolkit-text.ts');
    expect(bridge).toContain('useSyncExternalStore');
    expect(bridge).toContain('toolkit.nodes.');
    const ideas = read('src/lib/components/canvas/shapes/IdeaShape.tsx');
    expect(ideas).toContain('useToolkitText()');
    expect(ideas).toContain('value="in-progress"');
    expect(ideas).toContain("tn('inProgress')");
  });
});
