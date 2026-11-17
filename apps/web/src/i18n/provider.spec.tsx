// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { ApiError } from "../api";
import {
  DEFAULT_LANGUAGE,
  I18nProvider,
  LANGUAGE_STORAGE_KEY,
  messagesByLanguage,
  useI18n,
  type Language,
} from "./index";

type Context = ReturnType<typeof useI18n>;

function Probe({ onValue }: { onValue: (value: Context) => void }) {
  onValue(useI18n());

  return null;
}

function readContext(language: Language = DEFAULT_LANGUAGE): Context {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);

  let captured: Context | null = null;

  render(
    <I18nProvider>
      <Probe onValue={(value) => { captured = value; }} />
    </I18nProvider>,
  );

  if (!captured) throw new Error("the provider did not expose its context");

  return captured;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Web", () => {
  describe("Localization", () => {
    it(
      qc("web.i18n.plural", "picks the plural form of the interface locale and fills in the count"),
      () => {
        const forms = {
          one: "{count} order",
          few: "{count} orders of a few",
          many: "{count} orders of many",
          other: "{count} orders",
        };

        const english = readContext("en");

        expect(english.plural(1, forms)).toBe("1 order");
        expect(english.plural(0, forms)).toBe("0 orders");
        expect(english.plural(5, forms)).toBe("5 orders");

        const russian = readContext("ru");

        expect(russian.plural(2, forms)).toBe("2 orders of a few");
        expect(russian.plural(5, forms)).toBe("5 orders of many");
        expect(russian.plural(1, forms)).toBe("1 order");

        expect(russian.plural(3, { one: "{count} order", other: "{count} orders" })).toBe(
          "3 orders",
        );
      },
    );

    it(
      qc("web.i18n.error-message", "translates a failure by its code, by its status, or to the fallback"),
      () => {
        const russian = readContext("ru");
        const errors = messagesByLanguage.ru.errors as Record<string, string>;

        expect(russian.errorMessage(new ApiError("boom", 409, "CONFLICT"), "fallback")).toBe(
          errors.CONFLICT,
        );

        expect(russian.errorMessage({ status: 401 }, "fallback")).toBe(errors.UNAUTHENTICATED);
        expect(russian.errorMessage({ status: 503 }, "fallback")).toBe(errors.SERVICE_UNAVAILABLE);

        expect(russian.errorMessage(new ApiError("boom", 400, "A_CODE_THE_APP_LEARNS_LATER"), "fallback")).toBe(
          errors.BAD_REQUEST,
        );

        expect(russian.errorMessage({}, "the caller's own text")).toBe("the caller's own text");
        expect(russian.errorMessage("not an error", "the caller's own text")).toBe(
          "the caller's own text",
        );

        vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(russian.errorMessage(new TypeError("fetch failed"), "fallback")).toBe(
          errors.NETWORK_ERROR,
        );
        vi.restoreAllMocks();
      },
    );
  });
});
