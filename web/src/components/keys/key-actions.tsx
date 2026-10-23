import { useNavigate } from "@tanstack/react-router";

import { useState } from "react";

import { ConnectionSnippetsDialog } from "./connection-snippets-dialog";

import ButtonMenu, { type ButtonMenuItem } from "@/components/ui/button-menu";
import Icon from "@/components/ui/icon";

interface KeyActionsProps {
  keyId: string;
  keyName?: string;
}

export function KeyActions({ keyId, keyName }: KeyActionsProps) {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const navigate = useNavigate();

  const items: ButtonMenuItem[] = [
    {
      label: "View details",
      icon: <Icon name="arrow-right" className="size-4" />,
      onClick: () => navigate({ to: "/keys/$keyId", params: { keyId } }),
    },
    {
      label: "Connection snippets",
      icon: <Icon name="code" className="size-4" />,
      onClick: () => setSnippetsOpen(true),
    },
  ];

  return (
    <>
      <ButtonMenu items={items} align="end" variant="ghost" classNames={{ content: "w-48" }} />

      <ConnectionSnippetsDialog
        keyId={keyId}
        keyName={keyName}
        open={snippetsOpen}
        onOpenChange={setSnippetsOpen}
      />
    </>
  );
}
