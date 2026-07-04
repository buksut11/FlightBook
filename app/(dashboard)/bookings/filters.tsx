"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/lib/types/database";

export function BookingFilters({ agents }: { agents: Profile[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (q) params.set("q", q); else params.delete("q");
      router.replace(`?${params.toString()}`);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`?${params.toString()}`);
  }

  const selectCls = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        className="max-w-xs"
        placeholder="Search reference, phone, or name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className={selectCls}
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="confirmed">Confirmed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select
        className={selectCls}
        defaultValue={searchParams.get("agent") ?? ""}
        onChange={(e) => setParam("agent", e.target.value)}
      >
        <option value="">All agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.full_name}</option>
        ))}
      </select>
    </div>
  );
}
