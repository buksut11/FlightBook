"use client";

import { EntityDialog } from "@/components/entity-dialog";
import { recordPaymentAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const methodItems = [
  { value: "evc_plus", label: "EVC Plus" },
  { value: "zaad", label: "Zaad" },
  { value: "sahal", label: "Sahal" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function PaymentDialog({ bookingId, balance }: { bookingId: string; balance: number }) {
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
        <Select name="method" defaultValue="evc_plus" required items={methodItems}>
          <SelectTrigger id="method" className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {methodItems.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="transaction_ref">Transaction reference (optional)</Label>
        <Input id="transaction_ref" name="transaction_ref" />
      </div>
    </EntityDialog>
  );
}
