import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";

import { EditRoleDialog } from "./edit-role-dialog";

import { ConfirmDialog } from "@/components/confirm-dialog";
import ButtonMenu, { type ButtonMenuItem } from "@/components/ui/button-menu";
import Icon from "@/components/ui/icon";
import type { ManagedUser } from "@/lib/api/users";
import { deleteUser, userKeys } from "@/lib/api/users";

interface UserActionsProps {
  user: ManagedUser;
  isSelf: boolean;
}

export function UserActions({ user, isSelf }: UserActionsProps) {
  const [roleOpen, setRoleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      toast.success(`User ${user.email} removed.`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    },
  });

  const items: ButtonMenuItem[] = [
    {
      label: "Change role",
      icon: <Icon name="shield" className="size-4" />,
      disabled: isSelf,
      onClick: () => setRoleOpen(true),
    },
    {
      label: "Delete user",
      icon: <Icon name="trash-2" className="size-4" />,
      className: "text-destructive focus:text-destructive",
      disabled: isSelf,
      onClick: () => setDeleteOpen(true),
    },
  ];

  return (
    <>
      <ButtonMenu items={items} align="end" variant="ghost" classNames={{ content: "w-40" }} />

      <EditRoleDialog user={user} open={roleOpen} onOpenChange={setRoleOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete user ${user.email}?`}
        description={`This will permanently remove ${user.name} (${user.email}) and revoke all active sessions. This action cannot be undone.`}
        confirmText="Delete user"
        onConfirm={async () => {
          await deleteMutation.mutateAsync();
        }}
      />
    </>
  );
}
