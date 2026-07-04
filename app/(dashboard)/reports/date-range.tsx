"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1">
        <Label htmlFor="from">From</Label>
        <Input id="from" type="date" defaultValue={from} onChange={(e) => setParam("from", e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="to">To</Label>
        <Input id="to" type="date" defaultValue={to} onChange={(e) => setParam("to", e.target.value)} />
      </div>
    </div>
  );
}
