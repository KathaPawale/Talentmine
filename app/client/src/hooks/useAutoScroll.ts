import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const PIN_THRESHOLD_PX = 32;

/** Keep a scroll container pinned to the bottom as content grows, unless the
 * user has scrolled up. `deps` should change when new content arrives. */
export function useAutoScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: readonly unknown[],
): { isPinned: boolean; jumpToLatest: () => void } {
  const [isPinned, setIsPinned] = useState(true);
  const pinnedRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
      pinnedRef.current = pinned;
      setIsPinned(pinned);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const jumpToLatest = useCallback(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setIsPinned(true);
  }, [ref]);

  return { isPinned, jumpToLatest };
}
