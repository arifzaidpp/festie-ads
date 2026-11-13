"use client";

import { Check, ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export type AccountOption = { id: string; name: string };

/** Current ad account with a menu to switch to another or create one. */
export function AccountSwitcher({ accounts, currentId, className, direction = "down" }: { accounts: AccountOption[]; currentId: string; className?: string; direction?: "down" | "up" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const current = accounts.find((a) => a.id === currentId) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  async function choose(id: string) {
    if (id === currentId) return setOpen(false);
    setBusy(id);
    const result = await api(`/api/accounts/${id}`, "PUT");
    setBusy(null);
    setOpen(false);
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div ref={box} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center gap-2 rounded-xl bg-shell-control px-3 text-left hover:bg-shell-hover"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-2xs font-semibold tracking-caps text-muted-foreground uppercase">Ad account</span>
          <span className="block truncate text-xs font-semibold">{current?.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div
          role="listbox"
          className={cn(
            "absolute inset-x-0 z-50 rounded-xl bg-surface p-1 card-shadow-slight",
            direction === "down" ? "top-full mt-1" : "bottom-full mb-1",
          )}
        >
          {accounts.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              aria-selected={a.id === currentId}
              disabled={busy !== null}
              onClick={() => choose(a.id)}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-xs font-medium hover:bg-shell-hover disabled:opacity-60"
            >
              <Check className={cn("size-4 shrink-0", a.id === currentId ? "text-primary" : "invisible")} aria-hidden />
              <span className="truncate">{a.name}</span>
            </button>
          ))}
          <Link
            href="/accounts"
            onClick={() => setOpen(false)}
            className="mt-1 flex h-9 items-center gap-2 border-t border-border/40 px-2 pt-1 text-xs font-medium hover:bg-shell-hover"
          >
            <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
            All ad accounts
          </Link>
          <Link
            href="/accounts/new"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2 px-2 text-xs font-medium text-primary hover:bg-shell-hover"
          >
            <Plus className="size-4" aria-hidden />
            New ad account
          </Link>
        </div>
      ) : null}
    </div>
  );
}
