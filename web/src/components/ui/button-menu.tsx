import { type ReactNode } from "react";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import Icon from "./icon";

import { cn } from "@/lib/utils";

export interface ButtonMenuItem {
  label: string;
  icon?: ReactNode;
  className?: string;
  /** Greys the item out and blocks its onClick — for actions gated on data being present. */
  disabled?: boolean;
  onClick?: () => void;
}

export interface ButtonMenuProps {
  items: ButtonMenuItem[];
  /** Trigger style; "ghost" suits per-row actions in tables. */
  variant?: React.ComponentProps<typeof Button>["variant"];
  align?: "center" | "end" | "start";
  classNames?: {
    content?: string;
    menuItem?: string;
  };
}

function ButtonMenu({ items = [], align, variant, classNames }: ButtonMenuProps) {
  return (
    <DropdownMenu>
      {/* asChild: without it the trigger renders its own <button> around this one — nested
          buttons, which React flags as a hydration error and which swallow the click. */}
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant={variant} aria-label="Actions">
          <Icon name="ellipsis-vertical" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={align} className={classNames?.content}>
        {items.map((item) => {
          return (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              className={cn(classNames?.menuItem, item.className)}
            >
              {item.icon} {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ButtonMenu;
