import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { CreateKeyDialog } from "@/components/keys/create-key-dialog";
import KeyTable from "@/components/keys/key-table";
import { QueryError } from "@/components/query-error";
import { keysQuery } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/keys/")({
  component: Keys,
});

function Keys() {
  const keys = useQuery(keysQuery());

  return (
    <>
      <AppHeader
        title="Access Keys"
        description="S3 API credentials for apps and tools. Permissions are set per bucket."
        endContent={<CreateKeyDialog />}
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
            description="Create an access key so apps can read from and write to buckets through the S3 API."
            action={<CreateKeyDialog />}
          />
        ) : (
          <KeyTable keys={keys.data} />
        )}
      </div>
    </>
  );
}
