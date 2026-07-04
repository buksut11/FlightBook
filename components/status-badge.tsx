import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/types/database";

const styles: Record<BookingStatus, string> = {
  confirmed: "border-green-600 text-green-600",
  pending: "border-amber-600 text-amber-600",
  cancelled: "border-red-600 text-red-600",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="outline" className={styles[status]}>
      {status}
    </Badge>
  );
}
