import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import InputCheckboxGroup from "@/components/form/input-checkbox-group";
import InputNumber from "@/components/form/input-number";
import InputText from "@/components/form/input-text";
import InputTextarea from "@/components/form/input-textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import {
  type CorsConfiguration,
  type CorsRule,
  storageKeys,
  updateBucketCors,
} from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  allowedOrigins: string;
  allowedMethods: string[];
  allowedHeaders: string;
  exposeHeaders: string;
  maxAgeSeconds: number;
}

const METHOD_OPTIONS = [
  { label: "GET", value: "GET" },
  { label: "PUT", value: "PUT" },
  { label: "POST", value: "POST" },
  { label: "DELETE", value: "DELETE" },
  { label: "HEAD", value: "HEAD" },
];

const FIELDS = [
  "allowedOrigins",
  "allowedMethods",
  "allowedHeaders",
  "exposeHeaders",
  "maxAgeSeconds",
] as const;

interface CorsEditorDialogProps {
  bucketId: string;
  rules?: CorsRule[];
  trigger?: React.ReactNode;
}

function parseList(val: string): string[] {
  return val
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function initialValues(rules?: CorsRule[]): Values {
  const first = rules?.[0];
  if (first) {
    return {
      allowedOrigins: first.allowedOrigins.join("\n"),
      allowedMethods: first.allowedMethods,
      allowedHeaders: first.allowedHeaders?.join(", ") ?? "*",
      exposeHeaders: first.exposeHeaders?.join(", ") ?? "",
      maxAgeSeconds: first.maxAgeSeconds ?? 3600,
    };
  }
  return {
    allowedOrigins: "*",
    allowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
    allowedHeaders: "*",
    exposeHeaders: "ETag",
    maxAgeSeconds: 3600,
  };
}

export function CorsEditorDialog({ bucketId, rules, trigger }: CorsEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: initialValues(rules),
  });

  useEffect(() => {
    if (open) {
      reset(initialValues(rules));
    }
  }, [open, rules, reset]);

  const mutation = useMutation({
    mutationFn: (cfg: CorsConfiguration) => updateBucketCors(bucketId, cfg),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: storageKeys.bucketCors(bucketId) });
      toast.success("CORS rules updated");
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors?.rules?.[0]) {
        toast.error(error.fieldErrors.rules[0]);
        return;
      }
      applyApiError(error, setError, FIELDS);
    },
  });

  const onSubmit = handleSubmit((values) => {
    const origins = parseList(values.allowedOrigins);
    if (origins.length === 0) {
      setError("allowedOrigins" as never, { message: "Specify at least one allowed origin" });
      return;
    }
    if (!values.allowedMethods || values.allowedMethods.length === 0) {
      setError("allowedMethods" as never, { message: "Select at least one allowed method" });
      return;
    }

    const payload: CorsConfiguration = {
      rules: [
        {
          allowedOrigins: origins,
          allowedMethods: values.allowedMethods,
          allowedHeaders: parseList(values.allowedHeaders),
          exposeHeaders: parseList(values.exposeHeaders),
          maxAgeSeconds: Number(values.maxAgeSeconds) || 0,
        },
      ],
    };

    return mutation.mutateAsync(payload).catch(() => undefined);
  });

  const isEditing = rules && rules.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" startContent={<Icon name="arrow-left-right" className="size-4" />}>
            {isEditing ? "Edit CORS" : "Configure CORS"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 max-md:max-h-[92dvh] sm:max-w-md">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-6 pt-8 pr-12 pb-4 md:pt-6">
            <DialogTitle>{isEditing ? "Edit CORS rules" : "Configure CORS rules"}</DialogTitle>
            <DialogDescription>
              Cross-Origin Resource Sharing permits web browsers on other domains to access this
              bucket.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
            <InputTextarea.WithRHF
              control={control}
              name="allowedOrigins"
              label="Allowed origins"
              description="Domains allowed to access this bucket, separated by commas or new lines. Use * for any origin."
              placeholder={"https://example.com\nhttp://localhost:3000"}
              rows={3}
              required
            />

            <InputCheckboxGroup.WithRHF
              control={control}
              name="allowedMethods"
              label="Allowed methods"
              description="HTTP methods permitted for cross-origin requests."
              options={METHOD_OPTIONS}
              required
            />

            <InputText.WithRHF
              control={control}
              name="allowedHeaders"
              label="Allowed headers"
              description="Headers allowed in preflight requests, e.g. * or Authorization, Content-Type"
              placeholder="*"
            />

            <InputText.WithRHF
              control={control}
              name="exposeHeaders"
              label="Expose headers"
              description="Headers that browsers are permitted to read in responses, e.g. ETag"
              placeholder="ETag"
            />

            <InputNumber.WithRHF
              control={control}
              name="maxAgeSeconds"
              label="Max age (seconds)"
              description="How long browsers may cache CORS preflight responses."
              placeholder="3600"
              min={0}
              required
            />
          </div>

          <DialogFooter className="shrink-0 border-t bg-popover px-6 py-4 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Saving..." : "Save rules"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
