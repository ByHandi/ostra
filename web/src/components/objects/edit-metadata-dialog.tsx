import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import InputText from "@/components/form/input-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvalidateBucketContents } from "@/hooks/use-invalidate-bucket-contents";
import { objectMetadataQuery, updateObjectMetadata } from "@/lib/api/objects";
import { applyApiError } from "@/lib/form-errors";
import { formatBytes, formatDate } from "@/lib/format";

interface Values {
  contentType: string;
  cacheControl: string;
  contentDisposition: string;
}

const FIELDS = ["contentType", "cacheControl", "contentDisposition"] as const;

const COMMON_MIME_TYPES = [
  "text/plain",
  "application/json",
  "text/html",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/octet-stream",
] as const;

const CACHE_CONTROL_PRESETS = [
  { label: "1 year immutable", value: "public, max-age=31536000, immutable" },
  { label: "1 day", value: "public, max-age=86400" },
  { label: "1 hour", value: "public, max-age=3600" },
  { label: "no-cache", value: "no-cache" },
  { label: "no-store", value: "no-store" },
] as const;

interface EditMetadataDialogProps {
  bucketId: string;
  objectKey: string;
  name: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function EditMetadataDialog(props: EditMetadataDialogProps) {
  const { bucketId, objectKey, name, open, onOpenChange } = props;
  const queryClient = useQueryClient();
  const invalidate = useInvalidateBucketContents(bucketId);

  const { data, isLoading, error } = useQuery({
    ...objectMetadataQuery(bucketId, objectKey),
    enabled: open,
  });

  const { control, handleSubmit, setError, reset, setValue, formState } = useForm<Values>({
    defaultValues: {
      contentType: "",
      cacheControl: "",
      contentDisposition: "",
    },
  });

  useEffect(() => {
    if (data) {
      reset({
        contentType: data.contentType || "",
        cacheControl: data.cacheControl || "",
        contentDisposition: data.contentDisposition || "",
      });
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      updateObjectMetadata(bucketId, objectKey, {
        contentType: values.contentType.trim(),
        cacheControl: values.cacheControl.trim(),
        contentDisposition: values.contentDisposition.trim(),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(objectMetadataQuery(bucketId, objectKey).queryKey, updated);
      await invalidate();
      toast.success("Object metadata updated");
      onOpenChange(false);
    },
    onError: (err) => applyApiError(err, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  const contentDispositionPresets = [
    { label: "Inline", value: "inline" },
    { label: "Attachment", value: "attachment" },
    { label: "Attachment with name", value: `attachment; filename="${name}"` },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="tag" className="size-5 text-primary" />
              Edit metadata
            </DialogTitle>
            <DialogDescription className="truncate">
              Configure HTTP headers for <span className="font-medium text-foreground">{name}</span>
              .
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex flex-col gap-4 py-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              Couldn't load metadata for this object.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {data && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground">Size</span>
                    <p className="font-medium text-foreground tabular-nums">
                      {formatBytes(data.size)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last modified</span>
                    <p className="font-medium text-foreground">{formatDate(data.lastModified)}</p>
                  </div>
                  <div className="col-span-2 truncate">
                    <span className="text-muted-foreground">ETag</span>
                    <p className="truncate font-mono font-medium text-foreground">{data.etag}</p>
                  </div>
                </div>
              )}

              {/* Content-Type */}
              <div className="flex flex-col gap-1.5">
                <InputText.WithRHF
                  control={control}
                  name="contentType"
                  label="Content-Type"
                  placeholder="e.g. image/png"
                  autoComplete="off"
                  required
                  description="MIME type describing the file format."
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Suggestions:</span>
                  {COMMON_MIME_TYPES.map((mime) => (
                    <button
                      key={mime}
                      type="button"
                      onClick={() => setValue("contentType", mime, { shouldValidate: true })}
                      className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {mime}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cache-Control */}
              <div className="flex flex-col gap-1.5">
                <InputText.WithRHF
                  control={control}
                  name="cacheControl"
                  label="Cache-Control"
                  placeholder="e.g. public, max-age=31536000, immutable"
                  autoComplete="off"
                  description="Directives for browser and CDN caching. Leave empty to unset."
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Presets:</span>
                  {CACHE_CONTROL_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setValue("cacheControl", preset.value, { shouldValidate: true })
                      }
                      className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content-Disposition */}
              <div className="flex flex-col gap-1.5">
                <InputText.WithRHF
                  control={control}
                  name="contentDisposition"
                  label="Content-Disposition"
                  placeholder="e.g. inline or attachment"
                  autoComplete="off"
                  description="Controls whether the file displays inline or downloads. Leave empty to unset."
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Presets:</span>
                  {contentDispositionPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setValue("contentDisposition", preset.value, { shouldValidate: true })
                      }
                      className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={isLoading || Boolean(error)}
              isLoading={formState.isSubmitting}
              loadingText="Saving"
            >
              Save metadata
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
