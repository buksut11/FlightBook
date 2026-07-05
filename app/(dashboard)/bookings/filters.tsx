"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Profile } from "@/lib/types/database";

const statusItems = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

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

  const agentItems = [
    { value: "", label: "All agents" },
    ...agents.map((a) => ({ value: a.id, label: a.full_name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        className="max-w-xs"
        placeholder="Search reference, phone, or name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Select items={statusItems}
        value={searchParams.get("status") ?? ""}
        onValueChange={(v: string | null) => setParam("status", v ?? "")}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {statusItems.map((s) => (
            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select items={agentItems}
        value={searchParams.get("agent") ?? ""}
        onValueChange={(v: string | null) => setParam("agent", v ?? "")}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {agentItems.map((a) => (
            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
