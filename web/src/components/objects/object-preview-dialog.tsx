import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type PreviewKind, createPreviewLink } from "@/lib/api/objects";

interface ObjectPreviewDialogProps {
  bucketId: string;
  objectKey: string;
  name: string;
  kind: PreviewKind;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function ObjectPreviewDialog(props: ObjectPreviewDialogProps) {
  const { bucketId, objectKey, name, kind, open, onOpenChange } = props;
  const [url, setURL] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let canceled = false;
    createPreviewLink(bucketId, objectKey)
      .then((link) => {
        if (!canceled) setURL(link.url);
      })
      .catch(() => {
        if (!canceled) setError("Couldn't load a preview for this file.");
      });
    return () => {
      canceled = true;
    };
  }, [bucketId, objectKey, open]);

  const displayURL = open ? url : undefined;
  const displayError = open ? error : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate" title={name}>
            {name}
          </DialogTitle>
          <DialogDescription>Preview links expire after 5 minutes.</DialogDescription>
        </DialogHeader>
        {displayError ? (
          <p className="text-sm text-destructive">{displayError}</p>
        ) : displayURL ? (
          <PreviewContent url={displayURL} kind={kind} />
        ) : (
          <div className="h-80 animate-pulse rounded-md bg-muted" />
        )}
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function PreviewContent({ url, kind }: { url: string; kind: PreviewKind }) {
  if (kind === "image") {
    return <img src={url} alt="" className="max-h-[65dvh] w-full rounded-md object-contain" />;
  }
  if (kind === "video") {
    return <video src={url} controls className="max-h-[65dvh] w-full rounded-md bg-black" />;
  }
  if (kind === "pdf") {
    return (
      <iframe
        src={url}
        title="PDF preview"
        sandbox=""
        className="h-[65dvh] w-full rounded-md border"
      />
    );
  }
  return <TextPreview url={url} />;
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string>();

  useEffect(() => {
    let canceled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("preview request failed");
        return response.text();
      })
      .then((content) => {
        if (!canceled) setText(content);
      })
      .catch(() => {
        if (!canceled) toast.error("Couldn't load the text preview");
      });
    return () => {
      canceled = true;
    };
  }, [url]);

  return (
    <pre className="max-h-[65dvh] overflow-auto rounded-md bg-muted p-4 font-mono text-xs whitespace-pre-wrap">
      {text ?? "Loading preview…"}
    </pre>
  );
}
