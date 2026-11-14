import { describe, expect, it } from 'vitest';
import { dictionary, localePath, switchLocalePath, localeFromPath } from '../src/lib/i18n';

describe('language switch', () => {
  it('points /projects/x to /en/projects/x and back', () => {
    expect(switchLocalePath('/projects/x', 'it')).toBe('/en/projects/x');
    expect(switchLocalePath('/en/projects/x', 'en')).toBe('/projects/x');
  });

  it('handles the home page in both languages', () => {
    expect(switchLocalePath('/', 'it')).toBe('/en');
    expect(switchLocalePath('/en', 'en')).toBe('/');
    expect(switchLocalePath('/en/', 'en')).toBe('/');
  });

  it('does not mistake a path that merely starts with "en" for English', () => {
    expect(localeFromPath('/entries')).toBe('it');
    expect(localeFromPath('/en/info')).toBe('en');
  });
});

describe('localePath', () => {
  it('leaves Italian at the root and prefixes English', () => {
    expect(localePath('it', '/portfolio')).toBe('/portfolio');
    expect(localePath('en', '/portfolio')).toBe('/en/portfolio');
    expect(localePath('en', '/')).toBe('/en');
  });
});

describe('dictionary', () => {
  const leaves = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value
      ? Object.entries(value).flatMap(([key, child]) => leaves(child, `${prefix}${key}.`))
      : [prefix];

  it('has the same entries in both languages', () => {
    expect(leaves(dictionary.en)).toEqual(leaves(dictionary.it));
  });

  it('keeps the Italian wording of the original site', () => {
    expect(dictionary.it.contact.writeToMe).toBe('Scrivimi');
    expect(dictionary.it.contact.call).toBe('Chiama');
    expect(dictionary.it.portrait('Ada')).toBe('Ritratto di Ada');
  });

  it('translates the labels that differ', () => {
    expect(dictionary.en.contact.writeToMe).not.toBe(dictionary.it.contact.writeToMe);
    expect(dictionary.en.portrait('Ada')).toBe('Portrait of Ada');
  });
});
