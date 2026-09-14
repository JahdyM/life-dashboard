"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  BookHeart,
  BookOpen,
  BookOpenText,
  Bot,
  CalendarDays,
  ChartNoAxesCombined,
  GraduationCap,
  HeartHandshake,
  MoreHorizontal,
  MoonStar,
  Sparkles,
  Newspaper,
  Target,
  Telescope,
  TimerReset,
  Wallet,
} from "lucide-react";
import OverflowMenu from "@/components/common/OverflowMenu";
import {
  getDashboardModules,
  type DashboardModuleConfig,
  type DashboardModuleIconKey,
  type DashboardModuleView,
} from "@/lib/config/dashboard";

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const iconMap: Record<DashboardModuleIconKey, JSX.Element> = {
  sparkles: <Sparkles size={15} strokeWidth={1.9} />,
  bot: <Bot size={15} strokeWidth={1.9} />,
  calendar: <CalendarDays size={15} strokeWidth={1.9} />,
  timer: <TimerReset size={15} strokeWidth={1.9} />,
  ministry: <BookOpenText size={15} strokeWidth={1.9} />,
  moon: <MoonStar size={15} strokeWidth={1.9} />,
  book: <BookOpen size={15} strokeWidth={1.9} />,
  newspaper: <Newspaper size={15} strokeWidth={1.9} />,
  telescope: <Telescope size={15} strokeWidth={1.9} />,
  book_heart: <BookHeart size={15} strokeWidth={1.9} />,
  chart: <ChartNoAxesCombined size={15} strokeWidth={1.9} />,
  heart: <HeartHandshake size={15} strokeWidth={1.9} />,
  wallet: <Wallet size={15} strokeWidth={1.9} />,
  target: <Target size={15} strokeWidth={1.9} />,
  graduation_cap: <GraduationCap size={15} strokeWidth={1.9} />,
};

function NavLink({ item, active }: { item: DashboardModuleConfig; active: boolean }) {

  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`app-nav-link ${active ? "active" : ""}`}
      data-module={item.key}
    >
      <span className="app-nav-link-icon" aria-hidden="true">
        {iconMap[item.icon]}
      </span>
      <span className="app-nav-link-text">{item.label}</span>
    </Link>
  );
}

export function AppNav({ modules }: { modules?: DashboardModuleView[] }) {
  const pathname = usePathname();
  const primaryItems = getDashboardModules("primary", modules);
  const secondaryItems = getDashboardModules("secondary", modules);
  const secondaryActive = secondaryItems.some((item) => isActivePath(pathname, item.href));

  return (
    <nav className="app-nav" aria-label="Primary">
      <div className="app-nav-primary">
        {primaryItems.map((item) => (
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
          {secondaryItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              className={`app-nav-popover-link ${isActivePath(pathname, item.href) ? "active" : ""}`}
              data-module={item.key}
            >
              <span className="app-nav-link-icon" aria-hidden="true">
                {iconMap[item.icon]}
              </span>
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
