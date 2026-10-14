"use client";

import { useRef, useEffect } from "react";

/**
 * Normalizes scroll progress of a footer element between 0 and 1.
 * - 0: footer top edge enters the bottom of the viewport.
 * - 1: user has scrolled to the very bottom of the page.
 */
export function calculateScrollProgress(containerEl, customMetrics = null) {
  if (typeof window === "undefined" && !customMetrics) return 1;

  const scrollY = customMetrics
    ? customMetrics.scrollY
    : (window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || 0);

  const viewportHeight = customMetrics
    ? customMetrics.viewportHeight
    : (window.innerHeight || document.documentElement?.clientHeight || 0);

  const docHeight = customMetrics
    ? customMetrics.docHeight
    : Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
        document.documentElement?.offsetHeight || 0,
        document.body?.offsetHeight || 0,
        document.documentElement?.clientHeight || 0
      );

  const maxScroll = Math.max(0, docHeight - viewportHeight);

  // If document does not exceed viewport, user is already at the bottom
  if (maxScroll <= 0) {
    return 1;
  }

  // Fractional subpixel precision at page bottom
  if (scrollY >= maxScroll - 1) {
    return 1;
  }

  const rectTop = customMetrics
    ? customMetrics.rectTop
    : (containerEl ? containerEl.getBoundingClientRect().top : 0);

  const elementDocTop = rectTop + scrollY;
  const enterScroll = elementDocTop - viewportHeight;

  if (scrollY <= enterScroll) {
    return 0;
  }

  const startScroll = Math.max(0, enterScroll);
  const scrollRange = maxScroll - startScroll;

  if (scrollRange <= 0) {
    return 1;
  }

  const rawProgress = (scrollY - startScroll) / scrollRange;
  return Math.min(1, Math.max(0, rawProgress));
}

/**
 * Maps normalized progress (0 to 1) to transform and opacity:
 * - translateY: ((1 - progress) * 35%)
 * - scale: (0.7 + progress * 0.3)
 * - opacity: (0.2 + progress * 0.8)
 */
export function mapProgressToTransform(progress) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const translateYPercent = (1 - clamped) * 35;
  const scale = 0.7 + clamped * 0.3;
  const opacity = 0.2 + clamped * 0.8;

  const transform = `translateY(${translateYPercent.toFixed(3)}%) scale(${scale.toFixed(4)})`;
  const opacityStr = opacity.toFixed(4);

  return {
    progress: clamped,
    translateYPercent,
    scale,
    opacity,
    transform,
    opacityStr,
  };
}

/**
 * Attaches the resilient scroll driver to DOM elements.
 */
export function attachFooterScrollDriver(containerEl, targetEl, options = {}) {
  if (!containerEl) {
    return { destroy: () => {}, update: () => {} };
  }

  const animatedEl = targetEl || containerEl;
  const respectReducedMotion = options.respectReducedMotion !== false;
  const transformOrigin = options.transformOrigin || "center bottom";
  const rootMargin = options.rootMargin || "120px 0px 120px 0px";

  let rafId = null;
  let isNearViewport = false;
  let isDestroyed = false;

  const isReducedMotion = () => {
    if (!respectReducedMotion || typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };

  const applyStyles = (progress) => {
    if (!animatedEl || isDestroyed) return;

    if (isReducedMotion()) {
      animatedEl.style.transform = "translate3d(0, 0, 0) scale(1)";
      animatedEl.style.opacity = "1";
      if (typeof options.onProgress === "function") options.onProgress(1);
      return;
    }

    const { transform, opacityStr } = mapProgressToTransform(progress);
    animatedEl.style.transform = transform;
    animatedEl.style.opacity = opacityStr;

    if (typeof options.onProgress === "function") {
      options.onProgress(progress);
    }
  };

  const update = () => {
    if (isDestroyed || !containerEl) return;
    const progress = calculateScrollProgress(containerEl);
    applyStyles(progress);
  };

  const scheduleUpdate = () => {
    if (isDestroyed || rafId !== null) return;
    if (typeof requestAnimationFrame !== "function") {
      update();
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      update();
    });
  };

  const onScroll = () => {
    if (!isNearViewport) return;
    scheduleUpdate();
  };

  const onResize = () => {
    scheduleUpdate();
  };

  let observer = null;
  const hasIO = typeof window !== "undefined" && "IntersectionObserver" in window;

  if (hasIO) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === containerEl) {
            const wasNear = isNearViewport;
            isNearViewport = entry.isIntersecting;

            if (isNearViewport) {
              if (animatedEl) {
                animatedEl.style.willChange = "transform, opacity";
                animatedEl.style.transformOrigin = transformOrigin;
              }
              scheduleUpdate();
            } else if (wasNear) {
              if (animatedEl) {
                animatedEl.style.willChange = "auto";
              }
              applyStyles(0);
            }
            break;
          }
        }
      },
      {
        root: null,
        rootMargin,
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );
    observer.observe(containerEl);
  } else {
    isNearViewport = true;
    if (animatedEl) {
      animatedEl.style.willChange = "transform, opacity";
      animatedEl.style.transformOrigin = transformOrigin;
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
  }

  scheduleUpdate();

  const destroy = () => {
    isDestroyed = true;

    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    }
  };

  return {
    destroy,
    update: scheduleUpdate,
  };
}

/**
 * Headless React hook with automatic teardown on unmount.
 */
export function useFooterScrollAnimation(options = {}) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const driverRef = useRef(null);
  const { rootMargin, respectReducedMotion, transformOrigin, onProgress } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const target = contentRef.current || container.firstElementChild || container;
    const driver = attachFooterScrollDriver(container, target, {
      rootMargin,
      respectReducedMotion,
      transformOrigin,
      onProgress,
    });
    driverRef.current = driver;

    return () => {
      driver.destroy();
      driverRef.current = null;
    };
  }, [rootMargin, respectReducedMotion, transformOrigin, onProgress]);

  return {
    containerRef,
    contentRef,
    driver: driverRef.current,
  };
}
