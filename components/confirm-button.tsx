"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types/action";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmButton({
  action,
  label,
  confirmTitle,
  confirmText,
  variant = "destructive",
}: {
  action: () => Promise<ActionResult>;
  label: ReactNode;
  confirmTitle: string;
  confirmText: string;
  variant?: "destructive" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success("Done");
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size="sm" />}>
        {label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmTitle}</DialogTitle>
          <DialogDescription>{confirmText}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : "Yes, continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
