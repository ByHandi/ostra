import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { useForm } from "react-hook-form";

import { CopyButton } from "@/components/copy-button";
import InputSelect from "@/components/form/input-select";
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
import type { UserRole } from "@/lib/api/session";
import type { CreateUserPayload, CreatedUser } from "@/lib/api/users";
import { createUser, userKeys } from "@/lib/api/users";
import { applyApiError } from "@/lib/form-errors";

interface Values {
  email: string;
  name: string;
  role: UserRole;
}

const FIELDS = ["email", "name", "role"] as const;

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer — read-only access to storage assets" },
  { value: "admin", label: "Admin — full read/write management access" },
];

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const queryClient = useQueryClient();

  const { control, handleSubmit, setError, reset, formState } = useForm<Values>({
    defaultValues: { email: "", name: "", role: "viewer" },
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => createUser(payload),
    onSuccess: (data) => {
      setCreated(data);
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
    onError: (error) => {
      applyApiError(error, setError, FIELDS);
    },
  });

  const onSubmit = handleSubmit((values) => {
    return mutation.mutateAsync(values).catch(() => undefined);
  });

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
          Create user
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={!created}>
        {created ? (
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
              <DialogDescription>
                Account created for {created.name} ({created.email}).
              </DialogDescription>
            </DialogHeader>

            <div className="text-warning-foreground rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="font-medium">Important: Save temporary credentials</p>
              <p className="mt-1">
                The temporary password is only shown once. Make sure to copy it now and share it
                with the operator securely.
              </p>
            </div>

            <dl className="grid gap-3 text-sm">
              <div className="space-y-1 rounded-md border bg-muted/40 p-3">
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-mono text-xs">{created.email}</dd>
              </div>

              <div className="space-y-1 rounded-md border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-muted-foreground">Temporary password</dt>
                  <CopyButton value={created.temporaryPassword} label="Copy password" />
                </div>
                <dd className="font-mono text-sm font-semibold tracking-wider text-primary">
                  {created.temporaryPassword}
                </dd>
              </div>
            </dl>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
              <DialogDescription>
                Add a new operator with admin or viewer permissions.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <InputText.WithRHF
                control={control}
                name="email"
                type="email"
                label="Email"
                placeholder="operator@example.com"
                required
              />

              <InputText.WithRHF
                control={control}
                name="name"
                label="Name (optional)"
                placeholder="Display name"
              />

              <InputSelect.WithRHF
                control={control}
                name="role"
                label="Role"
                options={ROLE_OPTIONS}
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={formState.isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isLoading={formState.isSubmitting}>
                Create user
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
