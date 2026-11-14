"use client";

// Two-step confirm for any button that finalises something (dispatch, resolve, end round):
// tap the button -> a native <dialog> repeats what will happen -> tap "Yes" to do it.
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  title: string;
  body?: React.ReactNode;
  confirm: string;
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
  danger?: boolean;
} & Omit<React.ComponentProps<typeof Button>, "onClick" | "children">;

export function ConfirmButton({ title, body, confirm, onConfirm, children, danger, ...button }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const yes = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); ref.current?.close(); }
  };
  return (
    <>
      <Button {...button} onClick={() => ref.current?.showModal()}>{children}</Button>
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        className="fixed inset-x-0 bottom-0 z-[1200] mx-auto mt-auto mb-0 w-full max-w-md rounded-t-[1.75rem] bg-card p-0 text-foreground shadow-nav backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:max-w-sm sm:rounded-[1.75rem]"
      >
        <div className="flex flex-col gap-4 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
          {body && <div className="text-sm text-muted-foreground">{body}</div>}
          <div className="grid grid-cols-2 gap-2">
            <Button size="tap" variant="outline" disabled={busy} onClick={() => ref.current?.close()}>Cancel</Button>
            <Button size="tap" variant={danger ? "destructive" : "default"} disabled={busy} onClick={yes}>{busy ? "…" : confirm}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
