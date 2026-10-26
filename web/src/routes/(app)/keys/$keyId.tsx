import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import { AdminAction } from "@/components/admin-action";
import AppHeader from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { ConnectionSnippetsDialog } from "@/components/keys/connection-snippets-dialog";
import { EditKeyExpirationDialog } from "@/components/keys/edit-key-expiration-dialog";
import KeyPermissions from "@/components/keys/key-permissions";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/errors";
import { useIsAdmin } from "@/lib/api/session";
import { bucketsQuery, deleteKey, keyQuery, storageKeys } from "@/lib/api/storage";
import { formatDate } from "@/lib/format";
import { getKeyExpirationStatus } from "@/lib/key-expiration";
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
  const isAdmin = useIsAdmin();

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
            <div className="flex items-center gap-2">
              <ConnectionSnippetsDialog keyId={k.id} keyName={k.name} />
              <AdminAction
                fallback={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled
                    startContent={<Icon name="trash-2" className="size-4" />}
                  >
                    Delete
                  </Button>
                }
                tooltip="Administrator role required to delete access keys"
              >
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
              </AdminAction>
            </div>
          )
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {key.isError ? (
          <QueryError error={key.error} onRetry={() => key.refetch()} backTo="/keys" />
        ) : (
          <>
            {k ? (
              <KeyInfo
                id={k.id}
                name={k.name}
                created={k.created}
                expired={k.expired}
                expiresAt={k.expiresAt}
              />
            ) : (
              <KeyInfoSkeleton />
            )}

            <Section
              title="Bucket permissions"
              description={
                isAdmin
                  ? "Check a box to grant a permission. Changes are saved immediately."
                  : "Bucket access permissions for this key (read-only view)."
              }
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

function KeyInfo({
  id,
  name,
  created,
  expired,
  expiresAt,
}: {
  id: string;
  name?: string;
  created: string;
  expired: boolean;
  expiresAt: string | null;
}) {
  const expiry = getKeyExpirationStatus({ expired, expiresAt });

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
      <div className="flex flex-col gap-3 sm:items-end">
        <div className="flex flex-wrap items-center gap-4 sm:justify-end">
          <div className="space-y-0.5 sm:text-right">
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm">{formatDate(created)}</p>
          </div>
          <div className="space-y-0.5 sm:text-right">
            <p className="text-xs text-muted-foreground">Expires</p>
            <div className="flex items-center gap-1.5 sm:justify-end">
              <span className="text-sm font-medium">
                {expiresAt ? formatDate(expiresAt) : "Never"}
              </span>
              {expiry.status === "expired" && <Badge variant="destructive">Expired</Badge>}
              {expiry.status === "expiring_soon" && <Badge variant="warning">Expiring soon</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AdminAction
            fallback={
              <Button
                variant="outline"
                size="sm"
                disabled
                startContent={<Icon name="calendar" className="size-4" />}
              >
                Edit expiration
              </Button>
            }
            tooltip="Administrator role required to change key expiration"
          >
            <EditKeyExpirationDialog
              keyId={id}
              keyName={name}
              currentExpiresAt={expiresAt}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  startContent={<Icon name="calendar" className="size-4" />}
                >
                  Edit expiration
                </Button>
              }
            />
          </AdminAction>
          <ConnectionSnippetsDialog
            keyId={id}
            keyName={name}
            trigger={
              <Button
                variant="outline"
                size="sm"
                startContent={<Icon name="code" className="size-4" />}
              >
                Connection snippets
              </Button>
            }
          />
        </div>
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
      <div className="space-y-2 sm:items-end">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}
