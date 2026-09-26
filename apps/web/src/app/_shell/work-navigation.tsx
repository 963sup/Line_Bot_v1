"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Destination = {
  href: "/home" | "/notifications" | "/explore" | "/assistant";
  label: string;
  exact: boolean;
  icon: ReactNode;
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const items: Destination[] = [
  {
    href: "/home",
    label: "Home",
    exact: true,
    icon: (
      <svg {...iconProps}>
        <path d="M3.5 10.5 12 3l8.5 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
  },
  {
    href: "/notifications",
    label: "Inbox",
    exact: false,
    icon: (
      <svg {...iconProps}>
        <path d="M5 4h14l2 8v8H3v-8l2-8Z" />
        <path d="M3 13h5l1.5 2h5L16 13h5" />
      </svg>
    ),
  },
  {
    href: "/explore",
    label: "Explore",
    exact: false,
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="m14.8 9.2-2 5.6-5.6 2 2-5.6 5.6-2Z" />
      </svg>
    ),
  },
  {
    href: "/assistant",
    label: "AI",
    exact: false,
    icon: (
      <svg {...iconProps}>
        <path d="m12 3 1.2 4.1L17 8.5l-3.8 1.4L12 14l-1.2-4.1L7 8.5l3.8-1.4L12 3Z" />
        <path d="m18.5 14 .7 2.3 2.3.7-2.3.8-.7 2.2-.8-2.2-2.2-.8 2.2-.7.8-2.3Z" />
      </svg>
    ),
  },
];

export default function WorkNavigation({
  activeHref,
}: {
  activeHref?: Destination["href"];
}) {
  const pathname = usePathname();
  return (
    <nav className="work-navigation" aria-label="主要導覽">
      {items.map(({ href, label, icon, exact }) => {
        const active = activeHref
          ? href === activeHref
          : pathname === href || (!exact && pathname.startsWith(`${href}/`));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}>
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
