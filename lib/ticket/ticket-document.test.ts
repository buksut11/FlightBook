import { describe, it, expect } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { TicketDocument } from "./ticket-document";
import type { TicketData } from "./load-ticket";

const base: TicketData = {
  reference: "TKT-ABC234",
  status: "confirmed",
  currency: "USD",
  customer: { full_name: "Asha Ali", phone: "0907000001", email: null },
  passengers: [
    { full_name: "Asha Ali", id_number: "P123", passenger_type: "adult" },
    { full_name: "Liban Ali", id_number: null, passenger_type: "child" },
  ],
  legs: [
    {
      flight_number: "GX101",
      origin_code: "MGQ", origin_city: "Mogadishu",
      destination_code: "HGA", destination_city: "Hargeisa",
      departure_at: "2026-08-01T08:00:00Z", arrival_at: "2026-08-01T10:00:00Z",
      cabin_class: "economy", baggage_kg: 20,
    },
  ],
  total_amount: 240,
  paid: 240,
  extra_baggage_kg: 0,
  discount_value: 0,
  discount_type: "none",
  agent_name: "Agent One",
};

async function renderTicket(data: TicketData): Promise<Buffer> {
  // Cast: @react-pdf's renderToBuffer wants ReactElement<DocumentProps>, but
  // TicketDocument's props are { data } — the JSX form in the route has the
  // same shape and react-pdf renders it fine.
  return renderToBuffer(
    createElement(TicketDocument, { data }) as ReactElement<DocumentProps>
  );
}

describe("TicketDocument", () => {
  it("renders a confirmed one-way ticket to a valid PDF", async () => {
    const buf = await renderTicket(base);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("renders a pending booking (with warning band) to a valid PDF", async () => {
    const buf = await renderTicket({ ...base, status: "pending", paid: 0 });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a round trip with two legs and extras to a valid PDF", async () => {
    const buf = await renderTicket({
      ...base,
      legs: [
        ...base.legs,
        {
          flight_number: "GX102",
          origin_code: "HGA", origin_city: "Hargeisa",
          destination_code: "MGQ", destination_city: "Mogadishu",
          departure_at: "2026-08-05T14:00:00Z", arrival_at: "2026-08-05T16:00:00Z",
          cabin_class: "business", baggage_kg: 30,
        },
      ],
      extra_baggage_kg: 10,
      discount_type: "percent",
      discount_value: 5,
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
