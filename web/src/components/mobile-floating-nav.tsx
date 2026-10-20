import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileFloatingNav() {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="fixed bottom-4 left-4 z-40 md:hidden">
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2 rounded-full bg-background/95 px-4 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/75"
        onClick={toggleSidebar}
      >
        <Icon name="panel-left" className="size-4" />
        Menu
      </Button>
    </div>
  );
}
