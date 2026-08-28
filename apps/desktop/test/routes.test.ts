import { describe, expect, it } from 'vitest';
import { desktopNavigation, desktopPathForView, desktopRoutes } from '../src/views.js';

describe('Desktop routes', () => {
  it('keeps the eight primary navigation entries in URL order', () => {
    expect(desktopRoutes.map(({ view, path }) => [view, path])).toEqual([
      ['portfolio', '/portfolio'],
      ['position-entry', '/accounts'],
      ['risk-center', '/risk-center'],
      ['performance', '/performance'],
      ['strategy', '/strategy'],
      ['journal', '/journal'],
      ['ai-chat', '/ai-chat'],
      ['providers', '/providers'],
      ['market-data', '/market-data'],
    ]);
    expect(desktopNavigation).toEqual([
      'portfolio',
      'position-entry',
      'risk-center',
      'performance',
      'strategy',
      'journal',
      'ai-chat',
      'providers',
      'market-data',
    ]);
  });

  it('resolves navigable views and leaves internal view state unrouted', () => {
    expect(desktopPathForView('portfolio')).toBe('/portfolio');
    expect(desktopPathForView('providers')).toBe('/providers');
    expect(desktopPathForView('market-data')).toBe('/market-data');
    expect(desktopPathForView('position-detail')).toBeNull();
    expect(desktopPathForView('automation')).toBeNull();
  });
});
