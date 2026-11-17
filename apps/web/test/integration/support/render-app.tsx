import { render } from "@testing-library/react";
import { App } from "../../../src/app";
import { I18nProvider } from "../../../src/i18n";

/**
 * Mounts the real application, router and providers included.
 *
 * `App` owns its `BrowserRouter`, so the route comes from the address bar rather
 * than from a prop; pushing the path before the render is what makes the panel
 * under test the one that mounts. The session is replaced by the spec, because
 * `auth-client` builds its instance at import time and a case must not talk to
 * Better Auth.
 */
export function renderAppAt(path: string): ReturnType<typeof render> {
  window.history.pushState({}, "", path);

  return render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );
}
