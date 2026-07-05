"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Plane } from "lucide-react";
import { SkyScene } from "@/components/aviation/sky-scene";
import { LoginForm } from "./login-form";

/**
 * Login hero: the Three.js sky fills the viewport, the sign-in card floats
 * above it, and a GSAP timeline choreographs the entrance alongside the
 * airliner's fly-in.
 */
export function LoginHero() {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-hero='brand']", { y: -24, autoAlpha: 0, duration: 0.9 }, 0.3)
        .from("[data-hero='card']", { y: 48, autoAlpha: 0, scale: 0.96, duration: 1 }, 0.7)
        .from("[data-hero='item']", { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.09 }, 1.0);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-hidden">
      <SkyScene />

      <div className="relative z-10 flex min-h-screen flex-col p-4">
        <header data-hero="brand" className="flex items-center gap-2 p-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/20 text-white shadow-lg backdrop-blur-md">
            <Plane className="size-5" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white drop-shadow-md">
            FlightBook
          </span>
        </header>

        <main className="flex flex-1 items-center justify-center py-10 lg:justify-end lg:pr-[10vw]">
          <LoginForm />
        </main>
      </div>
    </div>
  );
}
