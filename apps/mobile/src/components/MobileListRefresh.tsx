import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import { useMobileRuntime } from '../app/MobileRuntime';

type Viewport = {
  scroll: RefObject<ScrollView | null>;
  subscribe: (measure: () => void) => () => void;
};
const ListViewport = createContext<Viewport | null>(null);

export function ListPageScrollView(props: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const [listeners] = useState(() => new Set<() => void>());
  const [tracking, setTracking] = useState(false);
  const viewport = useMemo<Viewport>(
    () => ({
      scroll,
      subscribe(measure) {
        listeners.add(measure);
        setTracking(true);
        return () => {
          listeners.delete(measure);
          setTracking(listeners.size > 0);
        };
      },
    }),
    [listeners],
  );
  const notify = () => listeners.forEach((measure) => measure());
  return (
    <ListViewport.Provider value={viewport}>
      <ScrollView
        {...props}
        ref={scroll}
        onScroll={tracking ? notify : undefined}
        onLayout={notify}
        scrollEventThrottle={32}
      />
    </ListViewport.Provider>
  );
}

function RefreshIndicator({ label }: { label: string }) {
  const { theme } = useMobileRuntime();
  const viewport = useContext(ListViewport);
  const frame = useRef<View>(null);
  const generation = useRef(0);
  const [center, setCenter] = useState<number | null>(null);
  const measure = useCallback(() => {
    const scroll = viewport?.scroll.current?.getNativeScrollRef();
    const area = frame.current;
    if (!scroll || !area) return;
    const current = ++generation.current;
    scroll.measureInWindow((_x, top, _w, height) => {
      if (current !== generation.current || !frame.current) return;
      area.measureInWindow((_left, y, _width, listHeight) => {
        if (current !== generation.current) return;
        const start = Math.max(y, top);
        const end = Math.min(y + listHeight, top + height);
        setCenter(end > start ? (start + end) / 2 - y : null);
      });
    });
  }, [viewport]);
  useEffect(() => {
    measure();
    const unsubscribe = viewport?.subscribe(measure);
    return () => {
      generation.current++;
      unsubscribe?.();
    };
  }, [viewport, measure]);

  return (
    <View ref={frame} collapsable={false} onLayout={measure} style={styles.overlay}>
      <View
        style={[
          styles.marker,
          { backgroundColor: theme.surface1, borderColor: theme.border },
          center !== null && { position: 'absolute', top: center - 16 },
        ]}
      >
        <ActivityIndicator accessibilityLabel={label} size="small" color={theme.brand} />
      </View>
    </View>
  );
}

export function MobileListRefreshRegion({
  refreshing,
  children,
  label = '正在刷新列表',
  gap = 16,
}: {
  refreshing: boolean;
  children: ReactNode;
  label?: string | undefined;
  gap?: number | undefined;
}) {
  return (
    <View style={{ gap, position: 'relative' }} aria-busy={refreshing}>
      {children}
      {refreshing && <RefreshIndicator label={label} />}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
