import { describe, expect, it } from 'vitest';
import { desktopNavigation, desktopPathForView, desktopRoutes } from '../src/views.js';

describe('Desktop routes', () => {
  it('keeps the primary navigation entries in URL order', () => {
    expect(desktopRoutes.map(({ view, path }) => [view, path])).toEqual([
      ['performance', '/performance'],
      ['watchlist', '/watchlist'],
      ['position-entry', '/accounts'],
      ['risk-center', '/risk-center'],
      ['strategy', '/strategy'],
      ['arena', '/arena'],
      ['journal', '/journal'],
      ['ai-chat', '/ai-chat'],
      ['providers', '/providers'],
      ['market-data', '/market-data'],
    ]);
    expect(desktopNavigation).toEqual([
      'performance',
      'watchlist',
      'position-entry',
      'risk-center',
      'strategy',
      'arena',
      'journal',
      'ai-chat',
      'providers',
      'market-data',
    ]);
  });

  it('resolves navigable views and leaves internal view state unrouted', () => {
    expect(desktopPathForView('portfolio')).toBe('/performance');
    expect(desktopPathForView('providers')).toBe('/providers');
    expect(desktopPathForView('arena')).toBe('/arena');
    expect(desktopPathForView('market-data')).toBe('/market-data');
    expect(desktopPathForView('position-detail')).toBeNull();
    expect(desktopPathForView('automation')).toBeNull();
  });
});
