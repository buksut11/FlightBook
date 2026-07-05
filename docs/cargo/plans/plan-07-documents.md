# Plan 7 — Documents: AWB PDF, piece labels, flight manifest

**Read `docs/cargo/SPEC.md` (§6.9) first.** Requires Plan 6. Use `@react-pdf/renderer`
route handlers exactly like the existing ticket PDF (`app/(dashboard)/bookings/[id]/ticket/route.tsx`).

## Build

### 1. Barcode helper

`lib/cargo/barcode.ts`: render Code 128 as bar-widths for a given string, drawn as `<Rect>`
elements (or an SVG-path helper) inside react-pdf — **no new heavy dependencies**. Unit-test
the encoding against a known value.

### 2. Air Waybill PDF — `/cargo/shipments/[id]/awb/route.tsx`

A clean single-page AWB: header with airline name + AWB number (text + barcode), shipper and
consignee blocks, routing (origin → destination, flight + date if assigned), pieces table
(count, dims, gross/chargeable weight), commodity + description + declared value, itemized
charges with total and payment terms, "prepaid/collect" stamp, signature lines
(shipper/carrier), and issue date + issuing staff name. Available once a shipment is
`booked` or later; "Print AWB" button on the shipment detail and booking success page.

### 3. Piece labels PDF — `/cargo/shipments/[id]/labels/route.tsx`

One A6 page per physical piece (expand `pieces_count`): large AWB barcode + number,
"Piece i of N", origin → destination codes in very large type, weight, commodity code,
and handling badges (cold chain / valuable) when applicable. Button on shipment detail.

### 4. Cargo manifest PDF — `/cargo/flights/[id]/manifest/route.tsx`

Per-flight manifest: flight number, route, date, aircraft; table of all `manifested`+
shipments (AWB, shipper, consignee, pieces, gross kg, chargeable kg, m³, commodity,
handling flags); totals row; capacity vs load summary; generated-at timestamp + staff name.
"Print manifest" button on the flight cargo page (enabled once at least one shipment is
manifested).

All three must render correctly with long names (truncate gracefully), many pieces
(multi-page), and match the visual style/typography of the existing ticket PDF.

## How to verify

1. From a booked shipment: Print AWB → a professional one-page PDF, barcode present,
   charges match the detail page.
2. Print labels for a 3-piece shipment → 3 A6 pages, "Piece 1 of 3" … "3 of 3".
3. Manifest a couple of shipments, print the flight manifest → all rows + correct totals.
4. Scan the barcode with a phone barcode app → it reads the AWB number exactly.
5. Lint/test/build pass.
