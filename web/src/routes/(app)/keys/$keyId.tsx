import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import KeyPermissions from "@/components/keys/key-permissions";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { bucketsQuery, deleteKey, keyQuery, storageKeys } from "@/lib/api/storage";
import { formatDate } from "@/lib/format";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/keys/$keyId")({
  /**
   * Loads the key up front so the tab title can name it. A failure is left to
   * the page's own error state rather than the route's error screen.
   */
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(keyQuery(params.keyId)).then(
      (k) => k.name || "Unnamed",
      () => undefined,
    ),
  head: ({ loaderData }) =>
    pageMeta(loaderData ?? "Access key", "This key's permissions on each bucket."),
  component: KeyPage,
});

function KeyPage() {
  const { keyId } = Route.useParams();
  const key = useQuery(keyQuery(keyId));
  const buckets = useQuery(bucketsQuery());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const remove = async () => {
    try {
      await deleteKey(keyId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete access key");
      throw error;
    }
    queryClient.removeQueries({ queryKey: storageKeys.key(keyId) });
    queryClient.invalidateQueries({ queryKey: storageKeys.keys, exact: true });
    queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    toast.success("Access key deleted");
    navigate({ to: "/keys", replace: true });
  };

  const k = key.data;

  return (
    <>
      <AppHeader
        backTo="/keys"
        title={k ? k.name || "Unnamed" : "Access key"}
        description="This key's permissions on each bucket."
        endContent={
          k && (
            <ConfirmDialog
              title={`Delete access key ${k.name || k.id}?`}
              description="Apps still using this key lose access immediately. This action can't be undone."
              confirmText="Delete key"
              onConfirm={remove}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  startContent={<Icon name="trash-2" className="size-4" />}
                >
                  Delete
                </Button>
              }
            />
          )
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {key.isError ? (
          <QueryError error={key.error} onRetry={() => key.refetch()} backTo="/keys" />
        ) : (
          <>
            {k ? <KeyInfo id={k.id} created={k.created} /> : <KeyInfoSkeleton />}

            <Section
              title="Bucket permissions"
              description="Check a box to grant a permission. Changes are saved immediately."
            >
              {!k || buckets.isPending ? (
                <KeyPermissions.Skeleton />
              ) : buckets.isError ? (
                <QueryError error={buckets.error} onRetry={() => buckets.refetch()} />
              ) : (
                <KeyPermissions accessKey={k} buckets={buckets.data} />
              )}
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function KeyInfo({ id, created }: { id: string; created: string }) {
  return (
    <div className="grid gap-4 panel p-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-muted-foreground">Access key ID</p>
        <div className="flex items-center gap-1">
          <code className="truncate font-mono text-sm">{id}</code>
          <CopyButton value={id} label="Copy access key ID" />
        </div>
        <p className="text-xs text-muted-foreground">
          The secret key is shown only when the key is created.
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Created</p>
        <p className="text-sm">{formatDate(created)}</p>
      </div>
    </div>
  );
}

function KeyInfoSkeleton() {
  return (
    <div
      className="grid gap-4 panel p-4 sm:grid-cols-[1fr_auto]"
      role="status"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-64 max-w-full" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
  );
}
