import type { LinkProps } from "@tanstack/react-router";

import type Icon from "@/components/ui/icon";

type IconName = React.ComponentProps<typeof Icon>["name"];

export interface NavItem {
  title: string;
  /** Typed against the generated route tree, so a typo fails `tsc`. */
  href: NonNullable<LinkProps["to"]>;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Ringkasan",
    items: [{ title: "Dashboard", href: "/", icon: "layout-dashboard" }],
  },
  {
    label: "Storage",
    items: [
      { title: "Buckets", href: "/buckets", icon: "archive" },
      { title: "Custom Domains", href: "/domains", icon: "globe" },
      { title: "Access Keys", href: "/keys", icon: "key-round" },
    ],
  },
  {
    label: "Akun",
    items: [{ title: "Pengaturan", href: "/settings", icon: "settings" }],
  },
];
