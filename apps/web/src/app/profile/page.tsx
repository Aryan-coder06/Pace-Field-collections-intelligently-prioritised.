"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { request, type User } from "@/lib/api";
import { clearProtectedCache } from "@/lib/offline";
export default function Profile() {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: () => request<User>("/auth/me"),
  });
  const router = useRouter();
  return (
    <div className="officer-shell">
      <header className="mobile-head">
        <Link href="/" className="brand">
          <span className="brand-mark">P</span>pace
        </Link>
        <Link href="/" className="back-link">
          Today
        </Link>
      </header>
      <main className="promise-wrap">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>Profile</h1>
        {q.data && (
          <div className="surface profile-card">
            <span className="avatar">
              {q.data.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
            <h2>{q.data.name}</h2>
            <p className="muted">{q.data.email}</p>
            <span className="pill medium">{q.data.role.replace("_", " ")}</span>
            <button
              className="btn secondary"
              onClick={async () => {
                await clearProtectedCache(q.data);
                await request("/auth/logout", { method: "POST" });
                router.replace("/login");
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </main>
      <nav className="bottom-nav">
        <Link href="/">
          <span>Today</span>
        </Link>
        <Link href="/promises">
          <span>Promises</span>
        </Link>
        <Link href="/activity">
          <span>Activity</span>
        </Link>
        <Link className="selected" href="/profile">
          <span>Profile</span>
        </Link>
      </nav>
    </div>
  );
}
