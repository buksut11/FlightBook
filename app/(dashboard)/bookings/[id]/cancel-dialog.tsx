"use client";

import { ConfirmButton } from "@/components/confirm-button";
import { cancelBookingAction } from "../actions";

export function CancelDialog({ bookingId, reference }: { bookingId: string; reference: string }) {
  return (
    <ConfirmButton
      action={() => cancelBookingAction(bookingId, "leg")}
      label="Cancel booking"
      confirmTitle={`Cancel ${reference}?`}
      confirmText="This restores the seat(s) to the flight and cannot be undone."
    />
  );
}
