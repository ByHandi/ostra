import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import BucketAccess from "@/components/buckets/bucket-access";
import BucketSummary from "@/components/buckets/bucket-summary";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateDomainDialog } from "@/components/domains/create-domain-dialog";
import DomainTable from "@/components/domains/domain-table";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import Section from "@/components/section";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { bucketQuery, deleteBucket, storageKeys } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/buckets/$bucketId")({
  component: BucketPage,
});

function BucketPage() {
  const { bucketId } = Route.useParams();
  const bucket = useQuery(bucketQuery(bucketId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const remove = async () => {
    try {
      await deleteBucket(bucketId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Gagal menghapus bucket");
      throw error;
    }
    queryClient.removeQueries({ queryKey: storageKeys.bucket(bucketId) });
    queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
    queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    toast.success(`Bucket ${bucket.data?.name ?? ""} dihapus`);
    navigate({ to: "/buckets" });
  };

  return (
    <>
      <AppHeader
        showBackButton
        onBack={() => navigate({ to: "/buckets" })}
        title={bucket.data?.name ?? "Bucket"}
        description="Detail bucket, custom domain, dan access key yang bisa mengaksesnya."
        endContent={
          bucket.data && (
            <ConfirmDialog
              title={`Hapus bucket ${bucket.data.name}?`}
              description="Hanya bucket kosong tanpa custom domain yang bisa dihapus. Tindakan ini tidak bisa dibatalkan."
              confirmText="Hapus bucket"
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
        {bucket.isPending ? (
          <>
            <BucketSummary.Skeleton />
            <Section.Skeleton rows={2} />
            <Section.Skeleton rows={2} />
          </>
        ) : bucket.isError ? (
          <QueryError error={bucket.error} onRetry={() => bucket.refetch()} backTo="/buckets" />
        ) : (
          <>
            <BucketSummary bucket={bucket.data} />

            <Section
              title="Custom domain"
              description="Domain yang menyajikan isi bucket ini secara publik (read-only)."
              action={<CreateDomainDialog bucket={bucket.data.name} />}
            >
              {bucket.data.domainRecords.length === 0 ? (
                <EmptyState
                  icon="globe"
                  title="Belum ada custom domain"
                  description="Tambahkan domain supaya isi bucket bisa diakses publik, mis. untuk aset website."
                />
              ) : (
                <DomainTable domains={bucket.data.domainRecords} hideBucket />
              )}
            </Section>

            <Section
              title="Akses S3 API"
              description="Access key yang punya izin ke bucket ini. Izin diatur dari halaman masing-masing key."
            >
              <BucketAccess keys={bucket.data.keys} />
            </Section>
          </>
        )}
      </div>
    </>
  );
}
