import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";

import { CorsEditorDialog } from "@/components/buckets/cors-editor-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import Section from "@/components/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api/errors";
import { bucketCorsQuery, deleteBucketCors, storageKeys } from "@/lib/api/storage";

interface BucketCorsProps {
  bucketId: string;
}

export function BucketCors({ bucketId }: BucketCorsProps) {
  const queryClient = useQueryClient();
  const corsQuery = useQuery(bucketCorsQuery(bucketId));

  const deleteMutation = useMutation({
    mutationFn: () => deleteBucketCors(bucketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.bucketCors(bucketId) });
      toast.success("CORS rules cleared");
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Couldn't clear CORS rules");
    },
  });

  if (corsQuery.isPending) {
    return <BucketCorsSkeleton />;
  }

  if (corsQuery.isError) {
    return (
      <Section
        title="CORS rules"
        description="Cross-Origin Resource Sharing configuration for direct browser access."
      >
        <div className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <span>Failed to load CORS rules.</span>
          <Button variant="outline" size="sm" onClick={() => corsQuery.refetch()}>
            Retry
          </Button>
        </div>
      </Section>
    );
  }

  const rules = corsQuery.data?.rules ?? [];

  return (
    <Section
      title="CORS rules"
      description="Cross-Origin Resource Sharing rules permit web applications on other origins to upload or download files directly."
      action={
        rules.length > 0 && (
          <div className="flex gap-2">
            <CorsEditorDialog
              bucketId={bucketId}
              rules={rules}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  startContent={<Icon name="pencil" className="size-4" />}
                >
                  Edit
                </Button>
              }
            />
            <ConfirmDialog
              title="Clear CORS rules?"
              description="This will remove all CORS configuration from the bucket. Web browsers attempting cross-origin requests directly to S3 will be blocked."
              confirmText="Clear rules"
              onConfirm={() => deleteMutation.mutateAsync()}
              trigger={
                <Button
                  variant="destructive"
                  size="sm"
                  startContent={<Icon name="trash-2" className="size-4" />}
                >
                  Clear
                </Button>
              }
            />
          </div>
        )
      }
    >
      {rules.length === 0 ? (
        <EmptyState
          icon="arrow-left-right"
          title="No CORS rules configured"
          description="Direct browser uploads and cross-origin requests to this bucket are blocked by default."
          action={<CorsEditorDialog bucketId={bucketId} />}
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Allowed Origins</TableHead>
                <TableHead>Allowed Methods</TableHead>
                <TableHead>Allowed Headers</TableHead>
                <TableHead>Expose Headers</TableHead>
                <TableHead className="text-right">Max Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, idx) => (
                <TableRow key={rule.id || idx}>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 font-mono text-xs">
                      {rule.allowedOrigins.map((origin) => (
                        <Badge key={origin} variant="outline">
                          {origin}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.allowedMethods.map((method) => (
                        <Badge key={method} variant="secondary">
                          {method}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 font-mono text-xs">
                      {rule.allowedHeaders && rule.allowedHeaders.length > 0 ? (
                        rule.allowedHeaders.map((header) => (
                          <Badge key={header} variant="outline">
                            {header}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 font-mono text-xs">
                      {rule.exposeHeaders && rule.exposeHeaders.length > 0 ? (
                        rule.exposeHeaders.map((header) => (
                          <Badge key={header} variant="outline">
                            {header}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {rule.maxAgeSeconds ? `${rule.maxAgeSeconds.toLocaleString()}s` : "0s"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function BucketCorsSkeleton() {
  return <Section.Skeleton rows={2} />;
}

BucketCors.Skeleton = BucketCorsSkeleton;
