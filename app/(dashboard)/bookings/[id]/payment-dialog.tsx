"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { recordPaymentAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PaymentDialog({ bookingId, balance }: { bookingId: string; balance: number }) {
  const selectCls = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";
  return (
    <EntityDialog
      title="Record a payment"
      action={recordPaymentAction.bind(null, bookingId)}
      trigger={<Button>Record payment</Button>}
    >
      <div className="grid gap-2">
        <Label htmlFor="amount">Amount (remaining: {balance.toFixed(2)})</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={balance} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="method">Method</Label>
        <select id="method" name="method" className={selectCls} defaultValue="evc_plus" required>
          <option value="evc_plus">EVC Plus</option>
          <option value="zaad">Zaad</option>
          <option value="sahal">Sahal</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction_ref">Transaction reference (optional)</Label>
        <Input id="transaction_ref" name="transaction_ref" />
      </div>
    </EntityDialog>
  );
}
