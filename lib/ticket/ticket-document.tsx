import {
  Document, Page, Text, View, StyleSheet,
} from "@react-pdf/renderer";
import type { TicketData } from "./load-ticket";
import { formatDateTime, formatMoney } from "@/lib/format";

const AGENCY = process.env.NEXT_PUBLIC_AGENCY_NAME ?? "Flight Booking";

// Always-light palette so the printed ticket is readable on paper.
const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    borderBottomWidth: 2, borderBottomColor: "#0284c7", paddingBottom: 8, marginBottom: 12 },
  agency: { fontSize: 16, fontWeight: "bold", color: "#0284c7" },
  refLabel: { fontSize: 8, color: "#64748b", textAlign: "right" },
  ref: { fontSize: 18, fontWeight: "bold", textAlign: "right", letterSpacing: 2 },
  pendingBand: { backgroundColor: "#dc2626", color: "#ffffff", textAlign: "center",
    padding: 4, marginBottom: 12, fontSize: 11, fontWeight: "bold" },
  sectionTitle: { fontSize: 9, color: "#64748b", textTransform: "uppercase", marginBottom: 4,
    marginTop: 10, letterSpacing: 1 },
  leg: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 4, padding: 8, marginBottom: 6 },
  legRoute: { fontSize: 13, fontWeight: "bold" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  muted: { color: "#64748b" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4,
    borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 4 },
  bold: { fontWeight: "bold" },
  footer: { position: "absolute", bottom: 24, left: 28, right: 28, fontSize: 8,
    color: "#94a3b8", textAlign: "center", borderTopWidth: 1, borderTopColor: "#e2e8f0",
    paddingTop: 6 },
});

export function TicketDocument({ data }: { data: TicketData }) {
  const isPending = data.status !== "confirmed";
  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.agency}>{AGENCY}</Text>
          <View>
            <Text style={styles.refLabel}>Booking reference</Text>
            <Text style={styles.ref}>{data.reference}</Text>
          </View>
        </View>

        {isPending && (
          <Text style={styles.pendingBand}>
            NOT VALID — PAYMENT {data.status.toUpperCase() === "CANCELLED" ? "CANCELLED" : "PENDING"}
          </Text>
        )}

        <Text style={styles.sectionTitle}>Passenger(s)</Text>
        {data.passengers.map((p, i) => (
          <Text key={i}>
            {p.full_name}{p.id_number ? ` — ID ${p.id_number}` : ""} ({p.passenger_type})
          </Text>
        ))}

        <Text style={styles.sectionTitle}>Itinerary</Text>
        {data.legs.map((leg, i) => (
          <View key={i} style={styles.leg}>
            <Text style={styles.legRoute}>
              {leg.origin_code} → {leg.destination_code}  ·  {leg.flight_number}
            </Text>
            <View style={styles.row}>
              <Text style={styles.muted}>{leg.origin_city} → {leg.destination_city}</Text>
              <Text style={styles.muted}>{leg.cabin_class}</Text>
            </View>
            <View style={styles.row}>
              <Text>Departs: {formatDateTime(leg.departure_at)}</Text>
              <Text>Arrives: {formatDateTime(leg.arrival_at)}</Text>
            </View>
            <Text style={styles.muted}>Baggage allowance: {leg.baggage_kg} kg</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Customer</Text>
        <Text>{data.customer.full_name} · {data.customer.phone}</Text>

        <Text style={styles.sectionTitle}>Payment</Text>
        {data.extra_baggage_kg > 0 && (
          <Text style={styles.muted}>Extra baggage purchased: {data.extra_baggage_kg} kg</Text>
        )}
        {data.discount_type !== "none" && data.discount_value > 0 && (
          <Text style={styles.muted}>
            Discount applied ({data.discount_type === "percent" ? `${data.discount_value}%` : formatMoney(data.discount_value, data.currency)})
          </Text>
        )}
        <View style={styles.totalRow}>
          <Text style={styles.bold}>Total</Text>
          <Text style={styles.bold}>{formatMoney(data.total_amount, data.currency)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.muted}>Paid</Text>
          <Text style={styles.muted}>{formatMoney(data.paid, data.currency)}</Text>
        </View>

        <Text style={styles.footer}>
          Issued by {data.agent_name} · {AGENCY} · Generated {formatDateTime(new Date().toISOString())}
        </Text>
      </Page>
    </Document>
  );
}
