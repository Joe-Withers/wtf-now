import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query";

import { postJson, type ChangeResult } from "../api";

export function Wordmark() {
  return (
    <span className="wordmark">
      wtf-<b>now</b>
    </span>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value);
  return (
    <div
      className={`bar${percent >= 100 ? " done" : ""}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function hours(value: number): string {
  if (value < 1) return `${Math.max(5, Math.round((value * 60) / 5) * 5)} min`;
  const rounded = Math.round(value * 2) / 2;
  return `${rounded} ${rounded === 1 ? "hr" : "hrs"}`;
}

export function Loading<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isError) return <p className="status error">{query.error.message}</p>;
  if (query.data === undefined) return <p className="status">Loading…</p>;
  return <>{children(query.data)}</>;
}

type Snack = { message: string; undo?: () => void };
const SnackContext = createContext<(snack: Snack) => void>(() => {});

export const useSnack = () => useContext(SnackContext);

export function SnackHost({ children }: { children: ReactNode }) {
  const [snack, setSnack] = useState<Snack | null>(null);
  const timer = useRef<number>();

  const show = useCallback((next: Snack) => {
    window.clearTimeout(timer.current);
    setSnack(next);
    timer.current = window.setTimeout(() => setSnack(null), 6000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => show, [show]);
  return (
    <SnackContext.Provider value={value}>
      {children}
      {snack && (
        <div className="snack" role="status">
          <span>{snack.message}</span>
          {snack.undo && (
            <button
              onClick={() => {
                snack.undo?.();
                setSnack(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </SnackContext.Provider>
  );
}

/** Runs a write, refreshes everything and offers undo. */
export function useChange() {
  const client = useQueryClient();
  const snack = useSnack();

  const undo = useMutation({
    mutationFn: (id: string) => postJson(`/changes/${id}/undo`),
    onSuccess: () => {
      client.invalidateQueries();
      snack({ message: "Undone" });
    },
    onError: (error) => snack({ message: error.message }),
  });

  return useMutation({
    mutationFn: ({ path, body, method }: { path: string; body?: unknown; method?: string; message: string }) =>
      postJson<ChangeResult>(path, body, method),
    onSuccess: (result, { message }) => {
      client.invalidateQueries();
      snack({ message, undo: () => undo.mutate(result.change.id) });
    },
    onError: (error) => snack({ message: error.message }),
  });
}
