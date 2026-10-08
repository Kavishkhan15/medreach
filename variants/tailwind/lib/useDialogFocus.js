"use client";
import { useEffect } from "react";

// Dialog focus stays inside the active surface and returns to its entry point.
export function useDialogFocus(ref, open, onClose) {
  useEffect(() => {
    if (!open || !ref.current) return;
    const surface = ref.current;
    const previous = document.activeElement;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const targets = () => [...surface.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')]
      .filter((element) => element.getClientRects().length);
    targets()[0]?.focus();
    const keydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = targets();
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); surface.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !surface.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    surface.addEventListener("keydown", keydown);
    return () => {
      surface.removeEventListener("keydown", keydown);
      document.body.style.overflow = priorOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, open, onClose]);
}
