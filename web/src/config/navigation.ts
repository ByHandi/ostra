import type { LinkProps } from "@tanstack/react-router";

import type Icon from "@/components/ui/icon";

type IconName = React.ComponentProps<typeof Icon>["name"];

export interface NavItem {
  title: string;
  /** Typed against the generated route tree, so a typo fails `tsc`. */
  href: NonNullable<LinkProps["to"]>;
  icon: IconName;
  /** Label under the icon in the mobile tab bar, where the full title doesn't fit. */
  shortTitle?: string;
  /** Visible only to administrators. */
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", shortTitle: "Home", href: "/", icon: "layout-dashboard" }],
  },
  {
    label: "Storage",
    items: [
      { title: "Buckets", href: "/buckets", icon: "archive" },
      { title: "Custom Domains", shortTitle: "Domains", href: "/domains", icon: "globe" },
      { title: "Access Keys", shortTitle: "Keys", href: "/keys", icon: "key-round" },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Users", href: "/users", icon: "users", adminOnly: true },
      { title: "Settings", href: "/settings", icon: "settings" },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
