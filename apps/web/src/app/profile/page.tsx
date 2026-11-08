"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { request, type User } from "@/lib/api";
import { clearProtectedCache } from "@/lib/offline";
import { OfficerBottomNav } from "@/components/officer-bottom-nav";
export default function Profile() {
  const client = useQueryClient();
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
            <div className="language-setting">
              <span>
                <b>Officer language</b>
                <small>मुख्य फ़ील्ड वर्कफ़्लो की भाषा</small>
              </span>
              <div role="group" aria-label="Officer language">
                {(["en", "hi"] as const).map((language) => (
                  <button
                    key={language}
                    className={
                      q.data.language_preference === language ? "active" : ""
                    }
                    onClick={async () => {
                      const updated = await request<User>("/auth/preferences", {
                        method: "POST",
                        body: JSON.stringify({ language_preference: language }),
                      });
                      client.setQueryData(["me"], updated);
                    }}
                  >
                    {language === "en" ? "English" : "हिन्दी"}
                  </button>
                ))}
              </div>
            </div>
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
      <OfficerBottomNav active="profile" />
    </div>
  );
}
