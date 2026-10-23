import { Link } from "@tanstack/react-router";

import Icon from "@/components/ui/icon";

const TAB =
  "inline-flex items-center gap-1.5 border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground";

/**
 * Overview / Files navigation shown under the bucket page header. Switching tabs
 * replaces the history entry, so Back leaves the bucket instead of toggling tabs.
 */
export function BucketTabs({ bucketId }: { bucketId: string }) {
  return (
    <nav
      className="mt-2 -mb-4 flex [scrollbar-width:none] gap-4 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
      aria-label="Bucket sections"
    >
      <Link
        to="/buckets/$bucketId"
        params={{ bucketId }}
        replace
        activeOptions={{ exact: true, includeSearch: false }}
        className={TAB}
      >
        <Icon name="info" className="size-4" />
        Overview
      </Link>
      <Link
        to="/buckets/$bucketId/files"
        params={{ bucketId }}
        replace
        activeOptions={{ includeSearch: false }}
        className={TAB}
      >
        <Icon name="folder-open" className="size-4" />
        Files
      </Link>
      <Link
        to="/buckets/$bucketId/domains"
        params={{ bucketId }}
        replace
        activeOptions={{ includeSearch: false }}
        className={TAB}
      >
        <Icon name="globe" className="size-4" />
        Domains
      </Link>
      <Link
        to="/buckets/$bucketId/access"
        params={{ bucketId }}
        replace
        activeOptions={{ includeSearch: false }}
        className={TAB}
      >
        <Icon name="key-round" className="size-4" />
        Access
      </Link>
      <Link
        to="/buckets/$bucketId/settings"
        params={{ bucketId }}
        replace
        activeOptions={{ includeSearch: false }}
        className={TAB}
      >
        <Icon name="settings" className="size-4" />
        Settings
      </Link>
    </nav>
  );
}
