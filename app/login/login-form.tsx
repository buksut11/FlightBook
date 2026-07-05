"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, Plane, ShieldCheck } from "lucide-react";
import { login, type AuthResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthResult = { ok: true };

const inputStyles =
  "h-11 rounded-xl border-white/60 bg-white/70 pl-10 text-slate-900 shadow-sm transition-all duration-300 placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:bg-white focus-visible:ring-sky-400/25 focus-visible:shadow-lg focus-visible:shadow-sky-500/15 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus-visible:bg-white/10";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div data-hero="card" className="relative w-full max-w-md">
      {/* Ambient glow that lifts the card off the bright sky */}
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[2.5rem] bg-gradient-to-br from-sky-400/50 via-blue-500/25 to-indigo-500/40 opacity-70 blur-3xl"
      />

      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/50 bg-gradient-to-b from-white/85 to-white/60 p-8 shadow-2xl shadow-blue-950/30 backdrop-blur-2xl sm:p-10 dark:border-white/10 dark:from-slate-900/80 dark:to-slate-900/55">
        {/* Top edge highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
        />
        {/* Soft interior sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-full bg-white/40 blur-2xl dark:bg-white/5"
        />

        <div className="relative">
          <div data-hero="item" className="mb-6 flex flex-col items-center text-center">
            <span className="mb-5 flex size-14 rotate-[-8deg] items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-lg shadow-sky-500/40 ring-1 ring-white/50 transition-transform duration-300 hover:rotate-0">
              <Plane className="size-7" aria-hidden />
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
              Staff sign in
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Welcome back to the flight booking system
            </p>
          </div>

          <form action={formAction} className="grid gap-5">
            <div data-hero="item" className="grid gap-2">
              <Label
                htmlFor="email"
                className="text-[13px] font-medium tracking-wide text-slate-600 dark:text-slate-300"
              >
                Email
              </Label>
              <div className="relative">
                <Mail
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@flightbook.com"
                  required
                  className={inputStyles}
                />
              </div>
            </div>

            <div data-hero="item" className="grid gap-2">
              <Label
                htmlFor="password"
                className="text-[13px] font-medium tracking-wide text-slate-600 dark:text-slate-300"
              >
                Password
              </Label>
              <div className="relative">
                <Lock
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className={`${inputStyles} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {!state.ok && state.message && (
              <p
                role="alert"
                className="rounded-xl border border-red-200/70 bg-red-50/80 px-3.5 py-2.5 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
              >
                {state.message}
              </p>
            )}

            <div data-hero="item" className="mt-1">
              <Button
                type="submit"
                disabled={pending}
                className="group h-11 w-full rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-blue-600 text-[15px] font-semibold text-white shadow-lg shadow-sky-600/35 transition-all duration-300 hover:-translate-y-0.5 hover:from-sky-400 hover:via-blue-400 hover:to-blue-500 hover:shadow-xl hover:shadow-sky-500/45"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight
                      aria-hidden
                      className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                    />
                  </>
                )}
              </Button>
            </div>
          </form>

          <div
            data-hero="item"
            className="mt-7 flex items-center justify-center gap-1.5 border-t border-slate-900/10 pt-5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400"
          >
            <ShieldCheck className="size-3.5 text-sky-500" aria-hidden />
            Secure access for authorized staff only
          </div>
        </div>
      </div>
    </div>
  );
}
