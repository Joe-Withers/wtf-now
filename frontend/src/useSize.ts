import { useCallback, useEffect, useRef, useState } from "react";

/** Watches the space an element has, so what is drawn can be drawn to fit it. */
export function useSize() {
  const [size, setSize] = useState({ width: 900, height: 600 });
  const observer = useRef<ResizeObserver | null>(null);

  // The canvas only appears once the project has loaded, so the watch is set up
  // when it arrives, not when the screen does.
  const ref = useCallback((element: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) setSize({ width, height });
    };
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return { ref, size };
}
