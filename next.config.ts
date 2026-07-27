import type { NextConfig } from "next";

/**
 * The browser talks to Supabase directly (PostgREST, auth, storage, and
 * realtime over websockets), so the Supabase origin has to be allowed
 * explicitly or a `default-src 'self'` policy blocks the whole application.
 *
 * If the variable is not present at build time we fall back to allowing any
 * https/wss origin rather than shipping a policy that breaks the app — the
 * headers that matter most here (frame-ancestors, nosniff) do not depend on it.
 */
function supabaseOrigins(): { http: string; ws: string } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return { http: "https:", ws: "wss:" };
  try {
    const { origin } = new URL(raw);
    return { http: origin, ws: origin.replace(/^http/, "ws") };
  } catch {
    return { http: "https:", ws: "wss:" };
  }
}

const isDev = process.env.NODE_ENV === "development";
const supabase = supabaseOrigins();

const csp = [
  "default-src 'self'",
  // Next.js inlines its hydration and streaming payloads as <script> blocks.
  // Removing 'unsafe-inline' requires threading a per-request nonce through
  // middleware; until then this is defence in depth, not an XSS cure.
  // 'unsafe-eval' is needed by the dev-mode React refresh runtime only.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase.http}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase.http} ${supabase.ws}`,
  // Clickjacking is the live risk: cancelling a booking and recording a
  // payment are one-click actions inside an authenticated session.
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Redundant with frame-ancestors for modern browsers, honoured by old ones.
  { key: "X-Frame-Options", value: "DENY" },
  // Matters for the CSV and PDF responses, which must not be sniffed as HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Keeps booking ids out of the Referer sent to third-party origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // No `preload`: that is a long-lived, hard-to-reverse commitment for the
  // apex domain and should be an explicit decision by whoever owns the DNS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework and its version to scanners.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
