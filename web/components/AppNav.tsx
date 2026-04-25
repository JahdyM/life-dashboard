"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  BookHeart,
  BookOpenText,
  CalendarDays,
  ChartNoAxesCombined,
  HeartHandshake,
  MoonStar,
  Sparkles,
  Telescope,
  TimerReset,
} from "lucide-react";
import OverflowMenu from "@/components/common/OverflowMenu";

const PRIMARY_NAV_ITEMS = [
  { href: "/today", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/habits", label: "Habits" },
  { href: "/ministry", label: "Ministry" },
  { href: "/mood", label: "Mood" },
] as const;

const SECONDARY_NAV_ITEMS = [
  { href: "/spiritual-goals", label: "Spiritual Goals" },
  { href: "/spiritual-streaks", label: "Spiritual Streaks" },
  { href: "/stats", label: "Stats" },
  { href: "/couple", label: "Couple" },
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  const iconMap: Record<string, JSX.Element> = {
    "/today": <Sparkles size={14} />,
    "/calendar": <CalendarDays size={14} />,
    "/habits": <TimerReset size={14} />,
    "/ministry": <BookOpenText size={14} />,
    "/mood": <MoonStar size={14} />,
    "/spiritual-goals": <Telescope size={14} />,
    "/spiritual-streaks": <BookHeart size={14} />,
    "/stats": <ChartNoAxesCombined size={14} />,
    "/couple": <HeartHandshake size={14} />,
  };

  return (
    <Link href={href} prefetch={false} className={`app-nav-link ${active ? "active" : ""}`}>
      <span className="app-nav-link-icon" aria-hidden="true">
        {iconMap[href]}
      </span>
      <span className="app-nav-link-text">{label}</span>
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();
  const secondaryActive = SECONDARY_NAV_ITEMS.some((item) => isActivePath(pathname, item.href));


  return (
    <nav className="app-nav" aria-label="Primary">
      <div className="app-nav-primary">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            active={isActivePath(pathname, item.href)}
          />
        ))}
      </div>

      <OverflowMenu
        label="More"
        buttonLabel="More"
        buttonContent={<span className="app-nav-more-label">More</span>}
        className={`app-nav-more ${secondaryActive ? "active" : ""}`}
        menuClassName="app-nav-popover"
        align="right"
        active={secondaryActive}
      >
        <div className="app-nav-popover-links">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`app-nav-popover-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </OverflowMenu>
    </nav>
  );
}

export function LogoutButton() {
  return (
    <button
      className="header-logout"
      onClick={() => signOut({ callbackUrl: "/signin" })}
      type="button"
    >
      Log out
    </button>
  );
}
