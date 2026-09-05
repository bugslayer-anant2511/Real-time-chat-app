import { useEffect, useRef } from 'react';

export function useScrollToBottom(deps = [], { behavior = 'smooth', threshold = 120 } = {}) {
  const ref = useRef(null);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const shouldStick = isFirstRun.current || distanceFromBottom <= threshold;

    if (shouldStick) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: isFirstRun.current ? 'auto' : behavior,
      });
    }

    isFirstRun.current = false;
  }, deps);

  return ref;
}
