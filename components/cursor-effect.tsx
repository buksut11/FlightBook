"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Site-wide cursor effect: a bright dot hugs the pointer, a ring trails it
 * with GSAP inertia, and a soft glow drifts behind like a comet tail. The
 * ring expands over interactive elements and pulses on click. Only active
 * for fine pointers (mouse/trackpad) and disabled for reduced motion; the
 * native cursor stays visible so usability is never affected.
 */
export function CursorEffect() {
  const rootRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    const ring = ringRef.current;
    const dot = dotRef.current;
    if (!glow || !ring || !dot) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.set([glow, ring, dot], { xPercent: -50, yPercent: -50 });

      // Staggered follow speeds create the comet feel.
      const dotX = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power3.out" });
      const dotY = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power3.out" });
      const ringX = gsap.quickTo(ring, "x", { duration: 0.35, ease: "power3.out" });
      const ringY = gsap.quickTo(ring, "y", { duration: 0.35, ease: "power3.out" });
      const glowX = gsap.quickTo(glow, "x", { duration: 0.7, ease: "power3.out" });
      const glowY = gsap.quickTo(glow, "y", { duration: 0.7, ease: "power3.out" });

      let visible = false;
      const show = () => {
        if (visible) return;
        visible = true;
        gsap.to([dot, ring], { autoAlpha: 1, duration: 0.3 });
        gsap.to(glow, { autoAlpha: 0.55, duration: 0.6 });
      };
      const hide = () => {
        visible = false;
        gsap.to([dot, ring, glow], { autoAlpha: 0, duration: 0.3 });
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return;
        show();
        dotX(e.clientX);
        dotY(e.clientY);
        ringX(e.clientX);
        ringY(e.clientY);
        glowX(e.clientX);
        glowY(e.clientY);
      };

      // Grow the ring over anything clickable or focusable.
      const onOver = (e: PointerEvent) => {
        const target = e.target as Element | null;
        const interactive = !!target?.closest(
          "a, button, input, select, textarea, label, [role='button'], [data-slot='button']",
        );
        gsap.to(ring, {
          scale: interactive ? 1.9 : 1,
          opacity: interactive ? 0.9 : 1,
          duration: 0.35,
          ease: "power3.out",
          overwrite: "auto",
        });
      };

      const onDown = () => {
        gsap.to(ring, { scale: 0.8, duration: 0.15, ease: "power2.out", overwrite: "auto" });
        gsap.fromTo(
          glow,
          { scale: 1 },
          { scale: 1.35, duration: 0.4, ease: "power2.out", yoyo: true, repeat: 1 },
        );
      };
      const onUp = () => {
        gsap.to(ring, { scale: 1, duration: 0.4, ease: "elastic.out(1, 0.5)", overwrite: "auto" });
      };

      const onLeaveWindow = (e: MouseEvent) => {
        if (!e.relatedTarget) hide();
      };

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerover", onOver, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      document.addEventListener("mouseout", onLeaveWindow);
      document.addEventListener("visibilitychange", hide);

      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerover", onOver);
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
        document.removeEventListener("mouseout", onLeaveWindow);
        document.removeEventListener("visibilitychange", hide);
      };
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} aria-hidden className="pointer-events-none fixed inset-0 z-[9999] hidden [@media(pointer:fine)]:block">
      <div
        ref={glowRef}
        className="absolute top-0 left-0 size-36 rounded-full bg-sky-400/25 opacity-0 blur-3xl"
      />
      <div
        ref={ringRef}
        className="absolute top-0 left-0 size-8 rounded-full border border-sky-500/70 opacity-0 shadow-[0_0_12px_rgba(56,189,248,0.35)] dark:border-sky-300/70"
      />
      <div
        ref={dotRef}
        className="absolute top-0 left-0 size-1.5 rounded-full bg-sky-500 opacity-0 shadow-[0_0_8px_rgba(56,189,248,0.9)] dark:bg-sky-300"
      />
    </div>
  );
}
