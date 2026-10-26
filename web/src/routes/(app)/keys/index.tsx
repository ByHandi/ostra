import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdminAction } from "@/components/admin-action";
import AppHeader from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { ConnectionSnippetsDialog } from "@/components/keys/connection-snippets-dialog";
import { CreateKeyDialog } from "@/components/keys/create-key-dialog";
import KeyTable from "@/components/keys/key-table";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useIsAdmin } from "@/lib/api/session";
import { keysQuery } from "@/lib/api/storage";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/keys/")({
  head: () =>
    pageMeta(
      "Access Keys",
      "S3 API credentials for apps and tools. Permissions are set per bucket.",
    ),
  component: Keys,
});

function Keys() {
  const keys = useQuery(keysQuery());
  const isAdmin = useIsAdmin();

  return (
    <>
      <AppHeader
        title="Access Keys"
        description="S3 API credentials for apps and tools. Permissions are set per bucket."
        endContent={
          <div className="flex items-center gap-2">
            <ConnectionSnippetsDialog availableKeys={keys.data ?? []} />
            <AdminAction
              fallback={
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  startContent={<Icon name="plus" className="size-4" />}
                >
                  Create access key
                </Button>
              }
              tooltip="Administrator role required to create access keys"
            >
              <CreateKeyDialog />
            </AdminAction>
          </div>
        }
      />

      {/* Desktop: a flex column, so the table shrinks to the viewport and scrolls inside. */}
      <div className="p-4 md:flex md:flex-col md:p-6">
        {keys.isPending ? (
          <KeyTable.Skeleton />
        ) : keys.isError ? (
          <QueryError error={keys.error} onRetry={() => keys.refetch()} />
        ) : keys.data.length === 0 ? (
          <EmptyState
            icon="key-round"
            title="No access keys yet"
            description={
              isAdmin
                ? "Create an access key so apps can read from and write to buckets through the S3 API."
                : "No access keys have been created in this cluster."
            }
            action={isAdmin ? <CreateKeyDialog /> : undefined}
          />
        ) : (
          <KeyTable keys={keys.data} />
        )}
      </div>
    </>
  );
}
