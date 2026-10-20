import { DynamicIcon } from "lucide-react/dynamic";

import { cn } from "@/lib/utils";

type DynamicIconProps = React.ComponentProps<typeof DynamicIcon>;

function Icon({ className, ...props }: DynamicIconProps) {
  return (
    <DynamicIcon size={18} tabIndex={-1} {...props} className={cn("outline-none", className)} />
  );
}

export default Icon;
