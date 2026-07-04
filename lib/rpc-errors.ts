/**
 * Translates machine-readable errors raised by the Plan 2 RPCs
 * (e.g. "SOLD_OUT:GX101:2") into user-facing sentences.
 * Supabase may wrap messages, so we search for known codes anywhere.
 */
export function mapRpcError(message: string): string {
  const m = message ?? "";

  const soldOut = m.match(/SOLD_OUT:([^:\s]+):(\d+)/);
  if (soldOut) return `Only ${soldOut[2]} seat(s) left in that class on ${soldOut[1]}.`;

  const noBiz = m.match(/NO_BUSINESS_CABIN:(\S+)/);
  if (noBiz) return `${noBiz[1]} has no business cabin.`;

  const notBookable = m.match(/FLIGHT_NOT_BOOKABLE:(\S+)/);
  if (notBookable) return `${notBookable[1]} is not open for booking.`;

  const payOutbound = m.match(/PAY_ON_OUTBOUND:(\S+)/);
  if (payOutbound) return `Record this payment on the outbound leg (${payOutbound[1]}).`;

  const returnBefore = m.match(/RETURN_BEFORE_OUTBOUND:(\S+)/);
  if (returnBefore) return `The return flight ${returnBefore[1]} departs before the outbound flight.`;

  if (m.includes("FLIGHT_NOT_FOUND")) return "That flight no longer exists.";
  if (m.includes("BOOKING_NOT_FOUND")) return "That booking no longer exists.";
  if (m.includes("ALREADY_CANCELLED")) return "This booking is already cancelled.";
  if (m.includes("NOT_ALLOWED")) return "You don't have permission to do that.";
  if (m.includes("NOT_STAFF")) return "Your account is not an active staff account.";
  if (m.includes("CUSTOMER_REQUIRED")) return "Customer name, phone, and at least one passenger are required.";
  if (m.includes("RETURN_REQUIRED")) return "Choose a cabin class for the return flight.";
  if (m.includes("INVALID_SCOPE")) return "Something went wrong. Please try again.";

  return "Something went wrong. Please try again.";
}
