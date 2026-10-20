import { Link, useLocation } from "@tanstack/react-router";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { type NavItem, navGroups } from "@/config/navigation";

export interface SidebarUser {
  name: string;
  email: string;
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

interface Props {
  user: SidebarUser | null;
  onLogout?(): void | Promise<void>;
}

function AppSidebar({ user, onLogout }: Props) {
  const { pathname } = useLocation();
  const { open, toggleSidebar, setOpenMobile } = useSidebar();
  const [isLoggingOut, startLogout] = useTransition();

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          asChild
          isActive={isActivePath(pathname, item.href)}
          tooltip={item.title}
          onClick={() => setOpenMobile(false)}
        >
          <Link to={item.href}>
            <Icon name={item.icon} />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    ));

  return (
    <Sidebar collapsible="icon" className="z-50">
      <Button
        size="icon-xs"
        variant="outline"
        className="absolute top-1/2 -right-3 z-50 cursor-pointer max-md:hidden"
        onClick={toggleSidebar}
      >
        <Icon name={open ? "chevron-left" : "chevron-right"} />
      </Button>

      <SidebarHeader>
        <SidebarMenu className="space-y-2">
          <SidebarMenuItem className="flex gap-2 pt-1">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Icon name="cloud" className="size-4" />
            </span>

            <span className="flex min-w-0 flex-col overflow-hidden leading-none whitespace-nowrap transition-[width,opacity] group-data-[collapsible=icon]:opacity-0">
              <span className="font-medium">storage-edge</span>
              <span className="text-xs text-sidebar-foreground/70">Object storage</span>
            </span>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderItems(group.items)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {user && (
            <SidebarMenuItem hidden={!open}>
              <SidebarMenuButton asChild tooltip={user.name} className="h-auto py-1.5">
                <Link to="/settings">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                    {initials(user.name)}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="truncate text-xs text-sidebar-foreground/70">
                      {user.email}
                    </span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Keluar"
              disabled={isLoggingOut}
              className="text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={() => startLogout(async () => void (await onLogout?.()))}
            >
              <Icon
                name={isLoggingOut ? "loader-circle" : "log-out"}
                className={isLoggingOut ? "animate-spin" : ""}
              />
              <span>Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

export default AppSidebar;
