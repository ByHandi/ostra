import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { ConnectionSnippetsDialog } from "./connection-snippets-dialog";
import { EditKeyExpirationDialog } from "./edit-key-expiration-dialog";

import ButtonMenu, { type ButtonMenuItem } from "@/components/ui/button-menu";
import Icon from "@/components/ui/icon";
import { useIsAdmin } from "@/lib/api/session";

interface KeyActionsProps {
  keyId: string;
  keyName?: string;
  expiresAt?: string | null;
}

export function KeyActions({ keyId, keyName, expiresAt }: KeyActionsProps) {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [expirationOpen, setExpirationOpen] = useState(false);
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();

  const items: ButtonMenuItem[] = [
    {
      label: "View details",
      icon: <Icon name="arrow-right" className="size-4" />,
      onClick: () => navigate({ to: "/keys/$keyId", params: { keyId } }),
    },
  ];

  if (isAdmin) {
    items.push({
      label: "Edit expiration",
      icon: <Icon name="calendar" className="size-4" />,
      onClick: () => setExpirationOpen(true),
    });
  }

  items.push({
    label: "Connection snippets",
    icon: <Icon name="code" className="size-4" />,
    onClick: () => setSnippetsOpen(true),
  });

  return (
    <>
      <ButtonMenu items={items} align="end" variant="ghost" classNames={{ content: "w-48" }} />

      <EditKeyExpirationDialog
        keyId={keyId}
        keyName={keyName}
        currentExpiresAt={expiresAt ?? null}
        open={expirationOpen}
        onOpenChange={setExpirationOpen}
      />

      <ConnectionSnippetsDialog
        keyId={keyId}
        keyName={keyName}
        open={snippetsOpen}
        onOpenChange={setSnippetsOpen}
      />
    </>
  );
}
