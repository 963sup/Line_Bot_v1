"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/home", label: "首頁", icon: "⌂" },
  { href: "/notifications", label: "收件匣", icon: "●" },
  { href: "/explore", label: "探索", icon: "◇" },
  { href: "/settings", label: "我的", icon: "◎" },
] as const;

export default function WorkNavigation() {
  const pathname = usePathname();
  return (
    <nav className="work-navigation" aria-label="全域導覽">
      {items.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={
            pathname === href || (href !== "/home" && pathname.startsWith(`${href}/`))
              ? "page"
              : undefined
          }
        >
          <span className="nav-icon" aria-hidden="true">
            {icon}
          </span>
          <span className="nav-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
