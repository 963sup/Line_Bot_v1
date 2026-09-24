"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/home", label: "Home", icon: "⌂", exact: true },
  { href: "/notifications", label: "Inbox", icon: "▣", exact: false },
  { href: "/explore", label: "Explore", icon: "◇", exact: false },
  { href: "/home/assistant", label: "AI", icon: "✦", exact: false },
] as const;

export default function WorkNavigation() {
  const pathname = usePathname();
  return (
    <nav className="work-navigation" aria-label="全域導覽">
      {items.map(({ href, label, icon, exact }) => {
        const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {icon}
            </span>
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
