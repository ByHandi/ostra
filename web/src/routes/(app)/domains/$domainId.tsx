import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { toast } from "sonner";

import AppHeader from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import DnsRecords from "@/components/domains/dns-records";
import DomainSummary from "@/components/domains/domain-summary";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { deleteDomain, domainQuery, storageKeys, verifyDomain } from "@/lib/api/storage";

export const Route = createFileRoute("/(app)/domains/$domainId")({
  params: {
    parse: ({ domainId }) => ({ domainId: Number(domainId) }),
    stringify: ({ domainId }) => ({ domainId: String(domainId) }),
  },
  component: DomainPage,
});

function DomainPage() {
  const { domainId } = Route.useParams();
  const domain = useQuery(domainQuery(domainId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const invalidateLists = () => {
    queryClient.invalidateQueries({ queryKey: storageKeys.domains, exact: true });
    queryClient.invalidateQueries({ queryKey: storageKeys.buckets });
    queryClient.invalidateQueries({ queryKey: storageKeys.overview });
  };

  const verify = useMutation({
    mutationFn: () => verifyDomain(domainId),
    onSuccess: (d) => {
      queryClient.setQueryData(storageKeys.domain(domainId), d);
      invalidateLists();
      if (d.status === "active") toast.success(`${d.domain} is active`);
      else toast.warning("DNS doesn't match yet", { description: d.lastError });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Couldn't check DNS"),
  });

  const remove = async () => {
    try {
      await deleteDomain(domainId);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete domain");
      throw error;
    }
    queryClient.removeQueries({ queryKey: storageKeys.domain(domainId) });
    invalidateLists();
    toast.success(`${domain.data?.domain ?? "Domain"} deleted`);
    navigate({ to: "/domains", replace: true });
  };

  const d = domain.data;

  return (
    <>
      <AppHeader
        backTo="/domains"
        title={d?.domain ?? "Custom domain"}
        description={d ? `Serves the contents of bucket ${d.bucketName}.` : undefined}
        endContent={
          d && (
            <div className="flex gap-2">
              {d.status !== "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={verify.isPending}
                  loadingText="Checking"
                  onClick={() => verify.mutate()}
                  startContent={<Icon name="refresh-cw" className="size-4" />}
                >
                  Check now
                </Button>
              )}
              <ConfirmDialog
                title={`Delete ${d.domain}?`}
                description="The domain immediately stops serving the bucket's contents. The bucket's contents are not deleted."
                confirmText="Delete domain"
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
            </div>
          )
        }
      />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {domain.isPending ? (
          <>
            <DomainSummary.Skeleton />
            <DnsRecords.Skeleton />
          </>
        ) : domain.isError ? (
          <QueryError error={domain.error} onRetry={() => domain.refetch()} backTo="/domains" />
        ) : (
          <>
            <DomainSummary domain={domain.data} />
            <DnsRecords records={domain.data.dnsRecords} />
          </>
        )}
      </div>
    </>
  );
}
