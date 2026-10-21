import { Link } from "@tanstack/react-router";

import { Fragment } from "react";

import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

interface BreadcrumbsProps {
  bucketId: string;
  bucketName: string;
  /** Current folder, "" for the bucket root, otherwise ending in "/". */
  prefix: string;
}

/** bucket / folder / sub-folder, each segment linking to that folder. */
function Breadcrumbs({ bucketId, bucketName, prefix }: BreadcrumbsProps) {
  const segments = prefix.split("/").filter(Boolean);

  return (
    <nav aria-label="Folder" className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
      <Link
        to="/buckets/$bucketId/files"
        params={{ bucketId }}
        search={{}}
        className="inline-flex items-center gap-1.5 font-medium hover:underline"
      >
        <Icon name="archive" className="size-4 text-muted-foreground" />
        {bucketName}
      </Link>

      {segments.map((segment, i) => {
        const target = `${segments.slice(0, i + 1).join("/")}/`;
        const isLast = i === segments.length - 1;

        return (
          <Fragment key={target}>
            <Icon name="chevron-right" className="size-3.5 text-muted-foreground" />
            {isLast ? (
              <span className="truncate font-medium" aria-current="page">
                {segment}
              </span>
            ) : (
              <Link
                to="/buckets/$bucketId/files"
                params={{ bucketId }}
                search={{ prefix: target }}
                className="truncate text-muted-foreground hover:text-foreground hover:underline"
              >
                {segment}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

Breadcrumbs.Skeleton = () => <Skeleton className="h-5 w-48" />;
export default Breadcrumbs;
