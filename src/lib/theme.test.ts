import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme } from './theme';

/** Palsukan matchMedia untuk menguji resolusi 'system'. */
function mockDark(matches: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('dark') ? matches : false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('resolveTheme', () => {
  it('light dan dark dikembalikan apa adanya', () => {
    mockDark(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it("'system' mengikuti OS yang gelap", () => {
    mockDark(true);
    expect(resolveTheme('system')).toBe('dark');
  });

  it("'system' mengikuti OS yang terang", () => {
    mockDark(false);
    expect(resolveTheme('system')).toBe('light');
  });

  it("'system' jatuh ke terang kalau matchMedia tidak ada", () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(resolveTheme('system')).toBe('light');
  });
});
