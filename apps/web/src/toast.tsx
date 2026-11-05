import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error";
type ToastContextValue = {
  showToast: (message: string, kind?: ToastKind) => void;
};
type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const nextId = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, kind: ToastKind = "error") => {
    if (timeout.current) clearTimeout(timeout.current);
    setToast({ id: ++nextId.current, message, kind });
    timeout.current = setTimeout(dismissToast, kind === "success" ? 4000 : 6500);
  }, [dismissToast]);

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className={`toast-bubble toast-bubble-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live={toast.kind === "error" ? "assertive" : "polite"}
          data-testid="app-toast"
        >
          <span className="toast-bubble-icon" aria-hidden="true">
            {toast.kind === "success" ? "✓" : "!"}
          </span>
          <p>{toast.message}</p>
          <button type="button" onClick={dismissToast} aria-label="Закрыть уведомление">
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
