"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelBookingAction } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function CancelDialog({
  bookingId,
  reference,
  isRoundTrip,
}: {
  bookingId: string;
  reference: string;
  isRoundTrip: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"leg" | "pair">("leg");
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await cancelBookingAction(bookingId, scope);
      if (result.ok) toast.success("Cancelled");
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* shadcn's dialog is Base UI-based: composition uses `render`, not `asChild` */}
      <DialogTrigger render={<Button variant="destructive" size="sm">Cancel booking</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {reference}?</DialogTitle>
          <DialogDescription>
            This restores the seat(s) to the flight and cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {isRoundTrip && (
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "leg"} onChange={() => setScope("leg")} />
              Cancel just this leg
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="scope" checked={scope === "pair"} onChange={() => setScope("pair")} />
              Cancel the whole round trip
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : "Yes, cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
