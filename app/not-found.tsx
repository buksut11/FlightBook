import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">That page doesn&apos;t exist or you don&apos;t have access.</p>
      <Button render={<Link href="/">Back to dashboard</Link>} />
    </main>
  );
}
