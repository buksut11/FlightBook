/**
 * Assert that a Supabase environment variable is set, throwing a clear,
 * actionable message that names the missing variable.
 *
 * The Supabase client is constructed in middleware (which runs on every
 * request), so an unset variable otherwise fails deep inside @supabase/ssr with
 * a generic "Your project's URL and Key are required" error and surfaces as a
 * blanket 500 on every route — including /login — with no hint about the cause.
 *
 * Pass the literal `process.env.X` (not a dynamic `process.env[name]` lookup) so
 * Next.js can still statically inline NEXT_PUBLIC_* variables into the browser
 * bundle at build time.
 */
export function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see .env.example).`
    );
  }
  return value;
}
