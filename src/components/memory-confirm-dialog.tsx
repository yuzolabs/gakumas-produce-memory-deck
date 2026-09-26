import { useEffect, useRef, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';

/** Confirmation remains open on save failure, retaining the user's input. */
export function MemoryConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  action,
  busy = false,
  error,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  action: string;
  busy?: boolean;
  error?: string;
  children?: ReactNode;
  onConfirm: () => void;
}) {
  const openedUrl = useRef(window.location.href);
  useEffect(() => {
    if (open) openedUrl.current = window.location.href;
  }, [open]);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <AlertDialogContent
        finalFocus={() => {
          if (openedUrl.current === window.location.href) return true;
          document.getElementById('main-content')?.focus({ preventScroll: true });
          return false;
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>キャンセル</AlertDialogCancel>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? '処理中…' : action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
