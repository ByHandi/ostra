import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";

import Icon from "@/components/ui/icon";
import { isActivePath, navItems } from "@/config/navigation";
import { sessionContextQuery } from "@/lib/api/session";
import { cn } from "@/lib/utils";

/**
 * iOS-style bottom tab bar — the only navigation on phones; the sidebar is
 * desktop-only. Sits above the home indicator via the safe-area inset, and
 * keeps its own view-transition name so it stays put during page transitions.
 */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const session = useQuery(sessionContextQuery());
  const role = session.data?.user.role;

  const visibleItems = navItems.filter((item) => !item.adminOnly || role === "admin");

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl [view-transition-name:tab-bar] md:hidden"
    >
      <ul className={cn("grid", visibleItems.length === 6 ? "grid-cols-6" : "grid-cols-5")}>
        {visibleItems.map((item) => {
          const active = isActivePath(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                to={item.href}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className="group flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground transition-[color,transform] select-none active:scale-90 data-[active=true]:text-primary"
              >
                <Icon
                  name={item.icon}
                  className="size-5.5 transition-[filter] group-data-[active=true]:drop-shadow-[0_0_6px_var(--primary)]"
                />
                {item.shortTitle ?? item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
