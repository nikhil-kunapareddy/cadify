import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Button, IconButton } from "./Button";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  /** Hide the close button (e.g. for blocking confirmations). */
  hideClose?: boolean;
}

export function Dialog({ open, onOpenChange, title, description, icon, children, footer, width = 440, className, hideClose }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[60] grid animate-fade-in place-items-center overflow-y-auto bg-black/45 p-6">
          <RadixDialog.Content
            className={cn("relative w-full animate-pop-in rounded-xl bg-elevated text-fg shadow-dialog outline-none", className)}
            style={{ maxWidth: width }}
            tabIndex={-1}
            // Only runs when no child claimed focus (e.g. an autoFocus input):
            // focus the dialog itself rather than its close button.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).focus();
            }}
          >
            <div className="flex items-start gap-3 px-5 pt-5">
              {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
              <div className="min-w-0 flex-1">
                <RadixDialog.Title className="text-md font-semibold tracking-[-0.005em]">{title}</RadixDialog.Title>
                {description ? (
                  <RadixDialog.Description className="mt-1 text-sm text-fg-muted">{description}</RadixDialog.Description>
                ) : (
                  <RadixDialog.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RadixDialog.Description>
                )}
              </div>
              {!hideClose && (
                <RadixDialog.Close asChild>
                  <IconButton label="Close" icon={<X size={15} />} size="xs" tooltip={false} className="-mt-0.5 -mr-1.5" />
                </RadixDialog.Close>
              )}
            </div>
            {children && <div className="px-5 pt-4">{children}</div>}
            {footer ? <div className="flex justify-end gap-2 px-5 pt-5 pb-5">{footer}</div> : <div className="h-5" />}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: ReactNode;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  icon,
  busy,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      icon={icon}
      width={420}
      hideClose
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            loading={busy}
            autoFocus
            onClick={() => void onConfirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
