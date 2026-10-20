import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { CopyButton } from "@/components/copy-button";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { type CreatedKey, createKey, storageKeys } from "@/lib/api/storage";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  name: string;
}

const FIELDS = ["name"] as const;

/**
 * Two steps in one dialog: the name form, then the one-time secret. The secret
 * lives only in this component's state and is dropped when the dialog closes.
 */
export function CreateKeyDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { name: "" },
  });

  const mutation = useMutation({
    mutationFn: createKey,
    onSuccess: (key) => {
      setCreated(key);
      queryClient.invalidateQueries({ queryKey: storageKeys.keys });
      queryClient.invalidateQueries({ queryKey: storageKeys.overview });
    },
    onError: (error) => applyApiError(error, setError, FIELDS),
  });

  const onSubmit = handleSubmit((values) => mutation.mutateAsync(values).catch(() => undefined));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      reset();
      setCreated(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" startContent={<Icon name="plus" className="size-4" />}>
          Access key baru
        </Button>
      </DialogTrigger>
      <DialogContent
        // A stray click outside must not throw away a secret that cannot be shown again.
        onInteractOutside={(e) => created && e.preventDefault()}
      >
        {created ? (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Simpan secret key sekarang</DialogTitle>
              <DialogDescription>
                Secret ini hanya ditampilkan sekali. Kalau hilang, buat access key baru.
              </DialogDescription>
            </DialogHeader>

            <dl className="flex flex-col gap-3">
              <SecretRow label="Access key ID" value={created.id} />
              <SecretRow label="Secret access key" value={created.secretAccessKey} />
            </dl>

            <p className="text-sm text-muted-foreground">
              Key baru belum punya akses ke bucket mana pun. Atur izinnya di halaman detail key.
            </p>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Tutup
              </Button>
              <Button asChild>
                <Link
                  to="/keys/$keyId"
                  params={{ keyId: created.id }}
                  onClick={() => onOpenChange(false)}
                >
                  Atur izin bucket
                </Link>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Access key baru</DialogTitle>
              <DialogDescription>
                Dipakai aplikasi atau tool (aws-cli, rclone, SDK) untuk mengakses S3 API.
              </DialogDescription>
            </DialogHeader>

            <InputText.WithRHF
              control={control}
              name="name"
              label="Nama"
              placeholder="backend-produksi"
              autoComplete="off"
              autoFocus
              required
              description="Untuk mengenali key ini nanti, mis. nama aplikasinya."
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Batal
                </Button>
              </DialogClose>
              <Button type="submit" isLoading={formState.isSubmitting} loadingText="Membuat">
                Buat key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 rounded-md bg-muted/60 py-1 pr-1 pl-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all">{value}</code>
        <CopyButton value={value} label={`Salin ${label.toLowerCase()}`} />
      </dd>
    </div>
  );
}
