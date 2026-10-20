import { useEffect, useState } from "react";

interface Options {
  /** Minimum scroll delta (px) before reacting — avoids jitter on tiny scrolls. */
  threshold?: number;
  /** Don't hide until scrolled at least this far from the top (px). */
  revealOffset?: number;
}

/**
 * Returns `true` when a sticky element should be hidden: hide while scrolling down (past
 * `revealOffset`), reveal immediately while scrolling up. Tracks window scroll, rAF-throttled.
 */
export function useHideOnScroll({ threshold = 6, revealOffset = 72 }: Options = {}): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = Math.max(window.scrollY, 0);
      const diff = y - lastY;

      if (Math.abs(diff) > threshold) {
        if (diff > 0 && y > revealOffset) {
          setHidden(true); // scrolling down, past the reveal offset
        } else if (diff < 0) {
          setHidden(false); // scrolling up
        }
        lastY = y;
      } else if (y <= revealOffset) {
        setHidden(false); // always visible near the top
        lastY = y;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, revealOffset]);

  return hidden;
}
