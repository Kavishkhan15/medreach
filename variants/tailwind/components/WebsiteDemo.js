"use client";
import { useEffect, useRef } from "react";

export default function WebsiteDemo() {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      video.autoplay = !motion.matches;
      if (visible && !motion.matches) video.play().catch(() => {});
      else video.pause();
    };
    const activate = () => {
      if (!video.getAttribute("src")) {
        video.src = "/media/medreach-hospital-demo.mp4";
        video.load();
      }
    };
    video.muted = true;
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) activate();
        sync();
      }, { rootMargin: "150px" })
      : null;
    if (observer) observer.observe(video);
    else { visible = true; activate(); sync(); }
    motion.addEventListener("change", sync);
    return () => { observer?.disconnect(); motion.removeEventListener("change", sync); video.pause(); };
  }, []);
  return <video ref={ref} autoPlay muted loop playsInline controls preload="none"
    width="1080" height="720" poster="/media/medreach-hospital-demo-poster.jpg"
    aria-label="MedReach website demonstration: find a hospital, review its details and explore request options without submitting a request.">
    Explore hospital discovery and request options in the MedReach directory.
  </video>;
}
