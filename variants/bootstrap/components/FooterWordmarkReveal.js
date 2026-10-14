"use client";

import { useFooterScrollAnimation } from "@medreach/core";

/**
 * FooterWordmarkReveal
 * 
 * Cinematic, scroll-linked reveal component for the oversized MEDREACH wordmark.
 * - Pure white background (#FFFFFF)
 * - Oversized, bold MEDREACH wordmark in Cobalt Blue (#0047AB)
 * - Emerging and scaling smoothly as the user scrolls into the footer
 * - Driven by resilient useFooterScrollAnimation:
 *   - IntersectionObserver + passive scroll listener gated to viewport vicinity
 *   - requestAnimationFrame batching
 *   - Normalized progress: 0 (footer enters viewport) to 1 (scrolled to bottom)
 *   - Transform: translateY((1 - progress) * 35%) scale(0.7 + progress * 0.3)
 *   - Opacity: 0.2 + progress * 0.8
 *   - Clean teardown on unmount
 *   - prefers-reduced-motion safe
 */
export default function FooterWordmarkReveal() {
  const { containerRef, contentRef } = useFooterScrollAnimation({
    rootMargin: "150px 0px 150px 0px",
  });

  return (
    <div
      ref={containerRef}
      className="medreach-footer-reveal"
      aria-hidden="true"
      translate="no"
    >
      <div className="medreach-footer-reveal-stage">
        <span ref={contentRef} className="medreach-footer-wordmark">
          MEDREACH
        </span>
      </div>
    </div>
  );
}
