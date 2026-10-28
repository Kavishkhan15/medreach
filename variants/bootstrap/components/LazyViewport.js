"use client";
import { useEffect, useRef, useState } from "react";

/** Mount once near view; the existing map container reserves its layout space. */
export default function LazyViewport({ children, fallback, className, rootMargin = "200px" }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") { setReady(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setReady(true); observer.disconnect(); }
    }, { rootMargin });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [rootMargin]);
  return <div ref={ref} className={className}>{ready ? children : fallback}</div>;
}
