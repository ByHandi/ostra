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

export const Route = createFileRoute("/(app)/keys/$keyId")({
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
      toast.error(error instanceof ApiError ? error.message : "Gagal menghapus access key");
      throw error;
    }
    queryClient.removeQueries({ queryKey: storageKeys.key(keyId) });
    queryClient.invalidateQueries({ queryKey: storageKeys.keys, exact: true });
    queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    toast.success("Access key dihapus");
    navigate({ to: "/keys" });
  };

  const k = key.data;

  return (
    <>
      <AppHeader
        showBackButton
        onBack={() => navigate({ to: "/keys" })}
        title={k ? k.name || "Tanpa nama" : "Access key"}
        description="Izin key ini di setiap bucket."
        endContent={
          k && (
            <ConfirmDialog
              title={`Hapus access key ${k.name || k.id}?`}
              description="Aplikasi yang masih memakai key ini langsung kehilangan akses. Tindakan ini tidak bisa dibatalkan."
              confirmText="Hapus key"
              onConfirm={remove}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  startContent={<Icon name="trash-2" className="size-4" />}
                >
                  Hapus
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
              title="Izin bucket"
              description="Centang untuk memberi izin. Perubahan langsung tersimpan."
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
    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-1">
        <p className="text-xs text-muted-foreground">Access key ID</p>
        <div className="flex items-center gap-1">
          <code className="truncate font-mono text-sm">{id}</code>
          <CopyButton value={id} label="Salin access key ID" />
        </div>
        <p className="text-xs text-muted-foreground">
          Secret key hanya ditampilkan saat key dibuat.
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Dibuat</p>
        <p className="text-sm">{formatDate(created)}</p>
      </div>
    </div>
  );
}

function KeyInfoSkeleton() {
  return (
    <div
      className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto]"
      role="status"
      aria-label="Memuat"
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
