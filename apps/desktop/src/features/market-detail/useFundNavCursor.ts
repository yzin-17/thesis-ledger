import { useCallback, useEffect, useRef, useState } from 'react';
import type { FundNavReferences } from './useFundNavReferences.js';
import { chartOverlayHandlesEscape } from './market-chart-keyboard.js';

export function useFundNavCursor(references: FundNavReferences) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const referencesRef = useRef(references);
  referencesRef.current = references;
  const onChartClick = useCallback((event: { time?: unknown; hoveredObjectId?: unknown }) => {
    const date = typeof event.time === 'string' ? event.time : null;
    if (referencesRef.current.consumeClick(date)) { setLocked(null); setHovered(date); return; }
    if (typeof event.hoveredObjectId === 'string' && event.hoveredObjectId.startsWith('fund-trade:')) return;
    setLocked(date);
  }, []);
  const canSelectTrade = useCallback(() => !referencesRef.current.state.measuring, []);
  useEffect(() => {
    if (!locked) return;
    const unlock = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (chartOverlayHandlesEscape(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      setLocked(null);
      setHovered(null);
    };
    window.addEventListener('keydown', unlock, true);
    return () => window.removeEventListener('keydown', unlock, true);
  }, [locked]);
  return { hovered, locked, setHovered, setLocked, onChartClick, canSelectTrade };
}
