import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";

import InputSelect from "@/components/form/input-select";
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
import type { UserRole } from "@/lib/api/session";
import type { ManagedUser } from "@/lib/api/users";
import { updateUserRole, userKeys } from "@/lib/api/users";

interface EditRoleDialogProps {
  user: ManagedUser;
  open: boolean;
  onOpenChange(open: boolean): void;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin — full read/write management access" },
  { value: "viewer", label: "Viewer — read-only access to storage assets" },
];

export function EditRoleDialog({ user, open, onOpenChange }: EditRoleDialogProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updateUserRole(user.id, role),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`Role for ${updated.email} updated to ${updated.role}.`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update permissions for {user.name} ({user.email}).
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <InputSelect
            label="Role"
            value={role}
            options={ROLE_OPTIONS}
            onValueChange={(val) => setRole(val as UserRole)}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={mutation.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={role === user.role}
          >
            Save role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
