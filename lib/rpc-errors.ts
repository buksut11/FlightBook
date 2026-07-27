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

  const needsAdmin = m.match(/DISCOUNT_NEEDS_ADMIN:([\d.]+)/);
  if (needsAdmin) {
    return `Discounts above ${Number(needsAdmin[1])}% need an admin. Ask an admin to make this booking.`;
  }

  const tooMany = m.match(/TOO_MANY_PASSENGERS:(\d+)/);
  if (tooMany) return `A booking can hold at most ${tooMany[1]} passengers.`;

  const overpay = m.match(/OVERPAYMENT:([\d.]+)/);
  if (overpay) return `That is more than this booking owes (${overpay[1]} outstanding).`;

  if (m.includes("INVALID_DISCOUNT")) return "That discount is not valid. A percentage must be between 0 and 100.";
  if (m.includes("INVALID_BAGGAGE")) return "Extra baggage weight and fee cannot be negative.";
  if (m.includes("INVALID_PASSENGER_TYPE")) return "Each passenger must be an adult, child, or infant.";
  if (m.includes("PASSENGER_NAME_REQUIRED")) return "Every passenger needs a name.";
  if (m.includes("INVALID_AMOUNT")) return "Enter a payment amount greater than zero.";
  if (m.includes("NOTHING_OWED")) return "This booking is already paid in full.";
  if (m.includes("PROTECTED_COLUMNS")) return "That change has to go through the booking actions.";

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

/**
 * Explains why a database read failed, instead of letting a page render
 * misleading zeros or an empty list. The most common cause on this project is
 * an out-of-date database — migrations are applied by hand in the Supabase
 * SQL Editor — which surfaces as a missing function (PGRST202), a missing
 * table/view (42P01), a missing column (42703), or a missing relationship
 * (PGRST200). `what` names the function or data being loaded.
 */
export function rpcErrorText(
  error: { code?: string; message?: string },
  what: string
): string {
  const m = error.message ?? "";
  if (error.code === "PGRST202" || /could not find the function/i.test(m)) {
    return `The database is missing the ${what}() function. ` +
      `Run supabase/migrations/0010_reporting_fixes.sql in the Supabase SQL Editor, then reload.`;
  }
  // Check for a missing column before a missing relation: 42703 messages
  // ("column x of relation y does not exist") also mention a relation.
  if (error.code === "42703" || /column .* does not exist/i.test(m)) {
    return `The database schema is out of date for ${what} (a column is missing). ` +
      `Run supabase/migrations/0009_tiered_pricing_and_statements.sql (and any later files) ` +
      `in the Supabase SQL Editor, then reload.`;
  }
  if (error.code === "42P01" || /relation .* does not exist/i.test(m)) {
    return `The database is missing a table or view needed by ${what}. ` +
      `Apply the files in supabase/migrations in numeric order in the Supabase SQL Editor, then reload.`;
  }
  if (error.code === "PGRST200" || /could not find a relationship/i.test(m)) {
    return `The database schema is out of date for ${what}. ` +
      `Apply the files in supabase/migrations in numeric order in the Supabase SQL Editor, then reload.`;
  }
  if (m.includes("NOT_ADMIN")) return "Only admins can view reports.";
  if (m.includes("NOT_STAFF")) return "Your account is not an active staff account.";
  return m || "Something went wrong loading this data.";
}
