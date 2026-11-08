"use client";

import Link from "next/link";
import {
  Activity,
  CalendarDays,
  ContactRound,
  WalletCards,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@/lib/api";
import { translate, type Language } from "@/lib/i18n";

export function OfficerBottomNav({
  active,
}: {
  active: "today" | "promises" | "activity" | "profile";
}) {
  const client = useQueryClient();
  const user = client.getQueryData<User>(["me"]);
  if (user?.role === "BRANCH_MANAGER") return null;
  const language = (user?.language_preference ?? "en") as Language;
  const items = [
    ["today", translate(language, "today"), CalendarDays, "/"],
    ["promises", translate(language, "promises"), WalletCards, "/promises"],
    ["activity", translate(language, "activity"), Activity, "/activity"],
    ["profile", translate(language, "profile"), ContactRound, "/profile"],
  ] as const;
  return (
    <nav className="bottom-nav" aria-label="Officer navigation">
      {items.map(([key, label, Icon, href]) => (
        <Link
          key={key}
          className={active === key ? "selected" : ""}
          href={href}
        >
          <Icon size={20} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
