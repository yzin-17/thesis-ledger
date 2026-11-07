import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
const subscribe = (notify: () => void) => {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
};
export function useWatchlistPageVisible() {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState !== 'hidden',
    () => false,
  );
}
export function useWatchlistRowVisible() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(Boolean(entry?.isIntersecting)),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}
