"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the current route's server data fresh:
 * - instantly, via Supabase Realtime events on bookings/payments/flights
 *   (tables must be in the supabase_realtime publication — see
 *   supabase/migrations/0008_realtime.sql; a silent no-op otherwise);
 * - as a fallback, on an interval and when the tab regains focus.
 * Refreshes are skipped while the tab is hidden.
 */
export function LiveRefresh({ intervalMs = 5_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    // One booking touches several tables at once — coalesce the burst.
    const onDbChange = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(refresh, 250);
    };

    const supabase = createClient();
    const channel = supabase
      .channel("live-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, onDbChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onDbChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "flights" }, onDbChange)
      .subscribe();

    const id = setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
