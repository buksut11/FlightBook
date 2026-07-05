"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

/**
 * GSAP-powered route transition: on every navigation the page content fades
 * up and its top-level sections stagger in. Honors prefers-reduced-motion.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sections = Array.from(el.children[0]?.children ?? []).slice(0, 8);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out", clearProps: "all" },
      );
      if (sections.length > 1) {
        gsap.fromTo(
          sections,
          { autoAlpha: 0, y: 12 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.4,
            ease: "power2.out",
            stagger: 0.06,
            delay: 0.08,
            clearProps: "all",
          },
        );
      }
    }, el);

    return () => ctx.revert();
  }, [pathname]);

  return (
    <div ref={ref}>
      <div>{children}</div>
    </div>
  );
}
