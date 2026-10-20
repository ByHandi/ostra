import { Link } from "@tanstack/react-router";

import Icon from "@/components/ui/icon";

const TAB =
  "inline-flex items-center gap-1.5 border-b-2 border-transparent px-1 pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground";

/** Overview / Files navigation shown under the bucket page header. */
export function BucketTabs({ bucketId }: { bucketId: string }) {
  return (
    <nav className="mt-2 -mb-4 flex gap-4 border-b" aria-label="Bucket sections">
      <Link
        to="/buckets/$bucketId"
        params={{ bucketId }}
        activeOptions={{ exact: true, includeSearch: false }}
        className={TAB}
      >
        <Icon name="info" className="size-4" />
        Overview
      </Link>
      <Link
        to="/buckets/$bucketId/files"
        params={{ bucketId }}
        activeOptions={{ includeSearch: false }}
        className={TAB}
      >
        <Icon name="folder-open" className="size-4" />
        Files
      </Link>
    </nav>
  );
}
