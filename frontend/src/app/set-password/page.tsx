"use client";
// Darb 2.0 — /set-password: where an invited staff member chooses their own
// password (revision 4 #12).
//
// Public by necessity: the person arriving here has no session, and the invite
// token in the URL is the credential. Plain fetch BY DESIGN, for the same
// reason lib/trackApi.ts uses it — the shared axios instance has a 401
// interceptor that redirects to /login, which would bounce this page the
// moment the token turns out to be spent.
import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    if (password !== confirm) return setError("The two passwords do not match");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? "Could not set your password");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 1600);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-sand-600">
        This link is missing its invite code. Ask whoever invited you to send it again.
      </p>
    );
  }

  if (done) {
    return (
      <div className="space-y-2">
        <h1 className="font-display text-xl text-sand-900">You are all set</h1>
        <p className="text-sm text-sand-600">Taking you to the sign-in page.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="font-display text-xl text-sand-900">Choose your password</h1>
        <p className="text-sm text-sand-600 mt-1">
          This link works once. After that, sign in with your email and the password you pick here.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
          New password
        </label>
        <input
          type="password"
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          required
        />
        {tooShort && (
          <p className="text-xs text-amber-600 mt-1">At least 8 characters.</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-sand-700 mb-1.5 uppercase tracking-wide">
          Confirm password
        </label>
        <input
          type="password"
          dir="ltr"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full px-3 h-10 rounded-xl bg-white border border-sand-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          required
        />
        {mismatch && (
          <p className="text-xs text-amber-600 mt-1">These do not match yet.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || password.length < 8 || password !== confirm}
        className="w-full btn-primary h-10 disabled:opacity-50"
      >
        {loading ? "Saving..." : "Set password"}
      </button>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-sand-200 rounded-2xl shadow-soft p-8 space-y-6">
        <Image src="/logo.png" alt="Darb" width={140} height={48} className="object-contain h-10 w-auto" priority />
        <Suspense fallback={<p className="text-sm text-sand-600">Loading...</p>}>
          <SetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
