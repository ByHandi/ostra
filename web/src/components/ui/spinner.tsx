import Icon from "./icon";

import { cn } from "@/lib/utils";

type SpinnerProps = Omit<React.ComponentProps<typeof Icon>, "name">;

function Spinner({ className, size = 18, ...props }: SpinnerProps) {
  return (
    <Icon
      name="loader-2"
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
      size={size}
      {...props}
    />
  );
}

export { Spinner };
