import { type RefObject, useLayoutEffect, useState } from "react";

/** Font size (px) the large title shrinks to — iOS's inline nav-bar title. */
const COMPACT_TITLE_PX = 17;

/**
 * Set on <html> while a collapsing header is mounted: its fully collapsed
 * height (safe area + nav row + tabs). Sticky page toolbars use it as their
 * `top` so they pin right under the header.
 */
const PINNED_HEADER_VAR = "--app-header-pinned";

export interface CollapsingHeaderRefs {
  /** Fixed header; its height is driven from here. */
  header: RefObject<HTMLElement | null>;
  /** Nav row + large title + description at their natural (expanded) size. */
  content: RefObject<HTMLElement | null>;
  /** The nav row the title collapses into. */
  nav: RefObject<HTMLElement | null>;
  title: RefObject<HTMLElement | null>;
  /** Back chevron — the collapsed title lands just right of it. */
  backIcon: RefObject<HTMLElement | null>;
  /** Pinned under the title once collapsed (tabs). */
  bottom: RefObject<HTMLElement | null>;
  /** Actions beside the large title (top-level pages); they rise into the nav row with it. */
  actions: RefObject<HTMLElement | null>;
}

interface Metrics {
  full: number;
  bottom: number;
  range: number;
  dx: number;
  dy: number;
  actionsDy: number;
  scale: number;
}

function measure(refs: CollapsingHeaderRefs): Metrics | null {
  const content = refs.content.current;
  const nav = refs.nav.current;
  const title = refs.title.current;
  if (!content || !nav || !title) return null;

  const bottomHeight = refs.bottom.current?.offsetHeight ?? 0;
  const navBottom = nav.offsetTop + nav.offsetHeight;
  const scale = COMPACT_TITLE_PX / parseFloat(getComputedStyle(title).fontSize);
  const backIcon = refs.backIcon.current;
  // The chevron sits inside the absolutely positioned back button, so measure
  // it against the content box rather than via offsetLeft.
  const targetLeft = backIcon
    ? backIcon.getBoundingClientRect().right - content.getBoundingClientRect().left + 2
    : title.offsetLeft;
  const targetTop = nav.offsetTop + (nav.offsetHeight - title.offsetHeight * scale) / 2;

  const actions = refs.actions.current;
  const navCenter = nav.offsetTop + nav.offsetHeight / 2;

  document.documentElement.style.setProperty(PINNED_HEADER_VAR, `${navBottom + bottomHeight}px`);

  return {
    full: content.offsetHeight + bottomHeight,
    bottom: bottomHeight,
    range: Math.max(content.offsetHeight - navBottom, 1),
    dx: targetLeft - title.offsetLeft,
    dy: targetTop - title.offsetTop,
    actionsDy: actions ? navCenter - (actions.offsetTop + actions.offsetHeight / 2) : 0,
    scale,
  };
}

/**
 * Scroll-linked iOS large-title header for phones. The header is fixed and
 * shrinks by exactly the distance scrolled, so content slides up beneath it in
 * lockstep; across that range the title travels into the nav row while
 * shrinking, and `--p` (0 → 1) lets CSS fade the description and fill in the
 * blurred background. Styles are written straight to the DOM — no re-render
 * per scroll frame.
 *
 * Returns the expanded height, for the in-flow spacer that reserves the
 * header's space at the top of the page.
 */
export function useCollapsingHeader(refs: CollapsingHeaderRefs): number {
  const [fullHeight, setFullHeight] = useState(0);

  useLayoutEffect(() => {
    let metrics: Metrics | null = null;
    let ticking = false;

    const apply = () => {
      ticking = false;
      const header = refs.header.current;
      const title = refs.title.current;
      if (!metrics || !header || !title) return;

      const y = Math.min(Math.max(window.scrollY, 0), metrics.range);
      const p = y / metrics.range;
      header.style.height = `${metrics.full - y}px`;
      // Clip the title block at the top edge of the pinned tabs, so nothing
      // shows through behind them mid-collapse.
      const clip = refs.content.current?.parentElement;
      if (clip) clip.style.height = `${metrics.full - metrics.bottom - y}px`;
      header.style.setProperty("--p", p.toFixed(3));
      title.style.transform = `translate(${metrics.dx * p}px, ${metrics.dy * p}px) scale(${1 - (1 - metrics.scale) * p})`;
      const actions = refs.actions.current;
      if (actions) actions.style.transform = `translateY(${metrics.actionsDy * p}px)`;
    };

    const remeasure = () => {
      metrics = measure(refs);
      if (metrics) setFullHeight(metrics.full);
      apply();
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(apply);
      }
    };

    // Title or description wrapping, tabs appearing, rotation — all change the geometry.
    const observer = new ResizeObserver(remeasure);
    for (const ref of [refs.content, refs.bottom]) {
      if (ref.current) observer.observe(ref.current);
    }
    remeasure();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.documentElement.style.removeProperty(PINNED_HEADER_VAR);
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [refs]);

  return fullHeight;
}
