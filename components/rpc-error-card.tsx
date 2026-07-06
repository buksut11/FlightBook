import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rpcErrorText } from "@/lib/rpc-errors";

/**
 * Shown in place of dashboard/report data when the backing RPC fails, so a
 * broken database never renders as "$0.00 revenue".
 */
export function RpcErrorCard({
  error,
  functionName,
}: {
  error: { code?: string; message?: string };
  functionName: string;
}) {
  return (
    <Card className="border-destructive/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-destructive">
          Couldn&apos;t load this data
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {rpcErrorText(error, functionName)}
      </CardContent>
    </Card>
  );
}
