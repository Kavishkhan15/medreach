"use client";
import { useEffect, useRef } from "react";

export default function WebsiteDemo() {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compact = window.matchMedia("(max-width: 575px)");
    let visible = false;
    let activated = false;
    const sync = () => {
      video.autoplay = visible && !motion.matches && !document.hidden;
      if (video.autoplay) video.play().catch(() => {});
      else video.pause();
    };
    const activate = () => {
      activated = true;
      const src = compact.matches ? "/media/medreach-hospital-demo-mobile.mp4?v=20261028" : "/media/medreach-hospital-demo.mp4?v=20261028";
      if (video.getAttribute("src") !== src) {
        video.preload = motion.matches || navigator.connection?.saveData ? "metadata" : "auto";
        video.src = src;
        video.load();
      }
    };
    const resize = () => {
      video.poster = compact.matches ? "/media/medreach-hospital-demo-mobile-poster.webp" : "/media/medreach-hospital-demo-poster.webp";
      if (activated) { activate(); sync(); }
    };
    video.muted = true;
    video.autoplay = false;
    resize();
    const preloader = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { activate(); preloader.disconnect(); }
      }, { rootMargin: "500px" }) : null;
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) activate();
        sync();
      }, { rootMargin: "0px" })
      : null;
    if (preloader) preloader.observe(video);
    if (observer) observer.observe(video);
    else { visible = true; activate(); sync(); }
    motion.addEventListener("change", sync);
    compact.addEventListener("change", resize);
    document.addEventListener("visibilitychange", sync);
    return () => { preloader?.disconnect(); observer?.disconnect(); motion.removeEventListener("change", sync); compact.removeEventListener("change", resize); document.removeEventListener("visibilitychange", sync); video.pause(); };
  }, []);
  return <video ref={ref} autoPlay muted loop playsInline disablePictureInPicture preload="none"
    width="1440" height="900" poster="/media/medreach-hospital-demo-poster.webp"
    aria-label="MedReach website demonstration: find a hospital, review its details and explore request options without submitting a request.">
    Explore hospital discovery and request options in the MedReach directory.
  </video>;
}
