"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormEvent, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { request, type User } from "@/lib/api";
const schema = z.object({
  email: z.string().email("Enter a valid work email"),
  password: z.string().min(1, "Enter your password"),
});
type Fields = z.infer<typeof schema>;
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Fields>({ resolver: zodResolver(schema) });
  const submit = handleSubmit(async (values) => {
    setLoading(true);
    setError("");
    try {
      const user = await request<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      router.replace(user.role === "FIELD_OFFICER" ? "/" : "/");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Pace is unavailable. Check your connection and retry.",
      );
    } finally {
      setLoading(false);
    }
  });
  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/landing" className="brand" aria-label="About Pace">
          <span className="brand-mark">P</span>pace
        </Link>
        <span className="eyebrow login-eyebrow">
          FIELD COLLECTIONS, INTELLIGENTLY PRIORITISED
        </span>
        <h1>
          Your day,
          <br />
          with more clarity.
        </h1>
        <p className="muted">
          Sign in to your Pace workspace and pick up where your team needs you.
        </p>
        <form onSubmit={(e: FormEvent) => void submit(e)}>
          <label htmlFor="email">Work email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            {...register("email")}
          />
          {errors.email && (
            <small className="field-error">{errors.email.message}</small>
          )}
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            {...register("password")}
          />
          {errors.password && (
            <small className="field-error">{errors.password.message}</small>
          )}
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <button className="btn login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="login-safe">
          <ShieldCheck size={16} />
          <span>Your branch data is protected with role-based access.</span>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <details className="demo-hint">
            <summary>Local demo accounts</summary>
            <p>manager@pace.demo · rahul@pace.demo · neha@pace.demo</p>
            <p>Password: PaceDemo!2026</p>
          </details>
        )}
      </section>
      <aside className="login-side">
        <span className="side-overline">PACE · FIELD OPERATIONS</span>
        <div className="side-statement">
          <span className="side-rule" />
          <h2>
            Know where to focus.
            <br />
            <em>Make every visit count.</em>
          </h2>
          <p>
            A clearer daily portfolio for field teams and the people who support
            them.
          </p>
        </div>
        <span className="side-footer">
          Built for the work that moves local businesses forward.
        </span>
      </aside>
    </main>
  );
}
