import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rpcErrorText } from "@/lib/rpc-errors";

/**
 * Shown in place of page data when the backing query fails, so a broken
 * database never renders as "$0.00 revenue" or an empty list. `what` names
 * the function or data that failed to load.
 */
export function RpcErrorCard({
  error,
  what,
}: {
  error: { code?: string; message?: string };
  what: string;
}) {
  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-destructive">
          Couldn&apos;t load this data
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {rpcErrorText(error, what)}
      </CardContent>
    </Card>
  );
}
