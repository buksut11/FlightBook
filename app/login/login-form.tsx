"use client";

import { useActionState } from "react";
import { login, type AuthResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

const initial: AuthResult = { ok: true };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initial);

  return (
    <Card
      data-hero="card"
      className="w-full max-w-sm border-white/50 bg-white/75 shadow-2xl shadow-blue-950/20 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60"
    >
      <CardHeader>
        <CardTitle data-hero="item" className="text-2xl">Staff sign in</CardTitle>
        <CardDescription data-hero="item">Flight booking system</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div data-hero="item" className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="bg-white/70 transition-shadow duration-300 focus-visible:shadow-lg focus-visible:shadow-sky-500/20 dark:bg-white/5"
            />
          </div>
          <div data-hero="item" className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="bg-white/70 transition-shadow duration-300 focus-visible:shadow-lg focus-visible:shadow-sky-500/20 dark:bg-white/5"
            />
          </div>
          {!state.ok && state.message && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.message}
            </p>
          )}
          <div data-hero="item">
            <Button
              type="submit"
              disabled={pending}
              className="w-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/30"
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
