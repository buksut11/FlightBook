import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getProfile } from "@/lib/auth/get-profile";
import { loadTicketData } from "@/lib/ticket/load-ticket";
import { TicketDocument } from "@/lib/ticket/ticket-document";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await getProfile(); // redirects if not authenticated
  const { id } = await params;

  const data = await loadTicketData(id);
  if (!data) return new NextResponse("Not found", { status: 404 });

  const buffer = await renderToBuffer(<TicketDocument data={data} />);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ticket-${data.reference}.pdf"`,
    },
  });
}
