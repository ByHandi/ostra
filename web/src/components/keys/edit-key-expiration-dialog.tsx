import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useState } from "react";
import { toast } from "sonner";

import DatePicker from "@/components/form/date-picker";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { ApiError } from "@/lib/api/errors";
import { storageKeys, updateKeyExpiration } from "@/lib/api/storage";
import { formatDate } from "@/lib/format";
import {
  PRESET_EXPIRATION_OPTIONS,
  type PresetExpiration,
  calculateExpiresAt,
} from "@/lib/key-expiration";

interface EditKeyExpirationDialogProps {
  keyId: string;
  keyName?: string;
  currentExpiresAt: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function EditKeyExpirationDialog({
  keyId,
  keyName,
  currentExpiresAt,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
}: EditKeyExpirationDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled ? setControlledOpen! : setInternalOpen;

  const [preset, setPreset] = useState<PresetExpiration>(() =>
    currentExpiresAt ? "custom" : "never",
  );
  const [customDate, setCustomDate] = useState<Date | undefined>(() =>
    currentExpiresAt ? new Date(currentExpiresAt) : undefined,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    setErrorMessage(null);
    if (next) {
      if (currentExpiresAt) {
        setPreset("custom");
        setCustomDate(new Date(currentExpiresAt));
      } else {
        setPreset("never");
        setCustomDate(undefined);
      }
    }
  };

  const mutation = useMutation({
    mutationFn: (expiresAt: string | null) => updateKeyExpiration(keyId, expiresAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storageKeys.key(keyId) });
      queryClient.invalidateQueries({ queryKey: storageKeys.keys });
      toast.success("Access key expiration updated");
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fieldErrors?.expiresAt) {
        setErrorMessage(error.fieldErrors.expiresAt[0]);
      } else {
        toast.error(error instanceof Error ? error.message : "Couldn't update expiration");
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const { expiresAt, error } = calculateExpiresAt(preset, customDate);
    if (error) {
      setErrorMessage(error);
      return;
    }

    mutation.mutate(expiresAt);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Edit expiration</DialogTitle>
            <DialogDescription>
              Set when access key{" "}
              <span className="font-medium text-foreground">{keyName || keyId}</span> should expire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Current expiration:{" "}
              <span className="font-medium text-foreground">
                {currentExpiresAt ? formatDate(currentExpiresAt) : "Never expires"}
              </span>
            </div>

            <InputSelect
              label="Expiration"
              value={preset}
              onValueChange={(val) => {
                setPreset(val as PresetExpiration);
                setErrorMessage(null);
              }}
              options={PRESET_EXPIRATION_OPTIONS}
              startContent={<Icon name="calendar" className="size-4 text-muted-foreground" />}
              description="Choose a preset lifespan or specify a custom date."
            />

            {preset === "custom" && (
              <DatePicker
                label="Custom expiration date"
                value={customDate}
                onValueChange={(d) => {
                  setCustomDate(d);
                  setErrorMessage(null);
                }}
                required
                errorMessage={errorMessage || undefined}
                description="The key will stop working after this date."
              />
            )}

            {preset !== "custom" && errorMessage && (
              <p className="text-xs text-destructive">{errorMessage}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" isLoading={mutation.isPending} loadingText="Saving">
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
