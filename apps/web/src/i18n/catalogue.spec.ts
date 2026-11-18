// The landing page speaks every language the application offers, and a fix that
// only touches the English catalogue leaves two of the three visitors with the
// wording the report complained about.
import { describe, expect, it } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { languages, messagesByLanguage } from "./index";

describe("Web", () => {
  describe("Localization", () => {
    it(
      qc("web.i18n.cta-register", "labels the landing hero button as a registration action in every language"),
      () => {
        const labels = Object.fromEntries(
          languages.map((language) => [language, messagesByLanguage[language].landing.ctaCustomer]),
        );

        expect(labels).toEqual({ en: "Register", ru: "Зарегистрироваться", es: "Registrarse" });
      },
    );
  });
});
