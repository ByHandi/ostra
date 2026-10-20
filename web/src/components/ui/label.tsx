import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export interface LabelProps extends React.ComponentProps<typeof LabelPrimitive.Root> {
  isRequired?: boolean;
}

function Label({ isRequired, className, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-1 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {isRequired && <span className="text-destructive">*</span>}
    </LabelPrimitive.Root>
  );
}

export { Label };
