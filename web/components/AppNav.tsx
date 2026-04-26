"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  BookHeart,
  BookOpen,
  BookOpenText,
  CalendarDays,
  ChartNoAxesCombined,
  HeartHandshake,
  MoreHorizontal,
  MoonStar,
  Sparkles,
  Telescope,
  TimerReset,
} from "lucide-react";
import OverflowMenu from "@/components/common/OverflowMenu";
import {
  getDashboardModules,
  type DashboardModuleConfig,
  type DashboardModuleIconKey,
} from "@/lib/config/dashboard";

const PRIMARY_NAV_ITEMS = getDashboardModules("primary");
const SECONDARY_NAV_ITEMS = getDashboardModules("secondary");

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: DashboardModuleConfig; active: boolean }) {
  const iconMap: Record<DashboardModuleIconKey, JSX.Element> = {
    sparkles: <Sparkles size={14} />,
    calendar: <CalendarDays size={14} />,
    timer: <TimerReset size={14} />,
    ministry: <BookOpenText size={14} />,
    moon: <MoonStar size={14} />,
    book: <BookOpen size={14} />,
    telescope: <Telescope size={14} />,
    book_heart: <BookHeart size={14} />,
    chart: <ChartNoAxesCombined size={14} />,
    heart: <HeartHandshake size={14} />,
  };

  return (
    <Link href={item.href} prefetch={false} className={`app-nav-link ${active ? "active" : ""}`}>
      <span className="app-nav-link-icon" aria-hidden="true">
        {iconMap[item.icon]}
      </span>
      <span className="app-nav-link-text">{item.label}</span>
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
            key={item.key}
            item={item}
            active={isActivePath(pathname, item.href)}
          />
        ))}
      </div>

      <OverflowMenu
        label="More"
        buttonLabel="More"
        buttonContent={
          <span className="app-nav-more-label">
            <MoreHorizontal size={15} />
            More
          </span>
        }
        className={`app-nav-more ${secondaryActive ? "active" : ""}`}
        menuClassName="app-nav-popover"
        align="right"
        active={secondaryActive}
      >
        <div className="app-nav-popover-links">
          {SECONDARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
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
