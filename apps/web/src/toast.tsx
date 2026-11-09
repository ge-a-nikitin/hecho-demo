import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "./i18n";

type ToastKind = "success" | "error";
type ToastPhase = "entering" | "visible" | "leaving";
type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};
type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
  phase: ToastPhase;
};

/** Matches the exit transition in overlays.css. */
const LEAVE_DURATION = 320;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextId = useRef(0);
  const visibleId = useRef<number | null>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const removeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback((id: number) => {
    setToast((current) => (current && current.id === id ? { ...current, phase: "leaving" } : current));
    removeTimeout.current = setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, LEAVE_DURATION);
  }, []);

  const dismissToast = useCallback(() => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    hideTimeout.current = null;
    if (visibleId.current !== null) dismiss(visibleId.current);
  }, [dismiss]);

  const showToast = useCallback((message: string, kind: ToastKind = "error") => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (removeTimeout.current) clearTimeout(removeTimeout.current);

    const id = ++nextId.current;
    visibleId.current = id;
    setToast({ id, message, kind, phase: "entering" });

    // Paint the entering state first, then move to visible so the transition
    // runs — and so a newer toast retargets it instead of restarting.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToast((current) => (current && current.id === id ? { ...current, phase: "visible" } : current));
      });
    });

    hideTimeout.current = setTimeout(() => dismiss(id), kind === "success" ? 4000 : 6500);
  }, [dismiss]);

  useEffect(() => () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (removeTimeout.current) clearTimeout(removeTimeout.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className={`toast-bubble toast-bubble-${toast.kind}`}
          data-state={toast.phase}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          data-testid="app-toast"
        >
          <span className="toast-bubble-icon" aria-hidden="true">
            {toast.kind === "success" ? "✓" : "!"}
          </span>
          <p>{toast.message}</p>
          <button type="button" onClick={dismissToast} aria-label={t.common.close}>
            ×
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}

