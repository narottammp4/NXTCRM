"use client";
import { useState } from "react";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      style={{ width: "min(360px,90vw)", textAlign: "left" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "login",
              email: f.get("email"),
              password: f.get("password"),
            }),
          });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          window.location.assign("/");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to sign in");
          setBusy(false);
        }
      }}
    >
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary wide" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p style={{ fontSize: 13 }}>
        Accounts are created by your admin. Contact them if you need a password
        reset.
      </p>
    </form>
  );
}
