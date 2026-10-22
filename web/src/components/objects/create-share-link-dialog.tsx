import { useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/copy-button";
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
import { type ShareLinkExpiry, createShareLink } from "@/lib/api/objects";
import { formatDate } from "@/lib/format";

const EXPIRIES: { value: ShareLinkExpiry; label: string }[] = [
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
];

interface CreateShareLinkDialogProps {
  bucketId: string;
  objectKey: string;
  name: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function CreateShareLinkDialog(props: CreateShareLinkDialogProps) {
  const { bucketId, objectKey, name, open, onOpenChange } = props;

  const [expiresIn, setExpiresIn] = useState<ShareLinkExpiry>("1d");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [creating, setCreating] = useState(false);

  const close = (nextOpen: boolean) => {
    if (!nextOpen) setLink(null);
    onOpenChange(nextOpen);
  };

  const create = async () => {
    setCreating(true);
    try {
      const result = await createShareLink(bucketId, objectKey, expiresIn);
      setLink({ ...result, url: new URL(result.url, window.location.origin).href });
    } catch {
      toast.error("Couldn't create the share link");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>Share link created</DialogTitle>
              <DialogDescription>
                Anyone with this link can download {name} until {formatDate(link.expiresAt)}.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-1 rounded-md bg-muted/60 py-1 pr-1 pl-3">
              <code className="min-w-0 flex-1 font-mono text-xs break-all">{link.url}</code>
              <CopyButton value={link.url} label="Copy share link" />
            </div>
            <DialogFooter showCloseButton />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create share link</DialogTitle>
              <DialogDescription>
                Anyone with this link can download {name}. Choose when access ends.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Expires after</span>
              <div className="grid grid-cols-3 gap-2">
                {EXPIRIES.map((expiry) => (
                  <Button
                    key={expiry.value}
                    type="button"
                    variant={expiresIn === expiry.value ? "default" : "outline"}
                    onClick={() => setExpiresIn(expiry.value)}
                  >
                    {expiry.label}
                  </Button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="button" isLoading={creating} loadingText="Creating" onClick={create}>
                <Icon name="link" />
                Create link
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
