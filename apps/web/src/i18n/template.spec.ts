import { describe, expect, it } from "vitest";
import { qc } from "../../../api/src/test-support/qase-case";
import { formatTemplate, languages, messagesByLanguage } from "./index";

describe("Web", () => {
  describe("Localization", () => {
    it(
      qc("web.i18n.estimate-figures", "keeps the hours next to the amount in every language"),
      () => {
        const rendered = Object.fromEntries(
          languages.map((language) => [
            language,
            formatTemplate(messagesByLanguage[language].common.hoursAmount, { hours: "2", amount: "90" }),
          ]),
        );

        // An estimate is a price for hours: a translation that drops either
        // figure, or the parentheses that mark which figure is the money,
        // changes what the customer is agreeing to.
        expect(rendered).toEqual({ en: "2 h (90$)", ru: "2 ч (90$)", es: "2 h (90$)" });
      },
    );

    it(
      qc("web.i18n.template", "fills in the placeholders it was given and leaves the rest untouched"),
      () => {
        expect(formatTemplate("Created {date}", { date: "12 May 2026" })).toBe("Created 12 May 2026");
        expect(formatTemplate("Invoice {number}: {amount}", { number: "A-7", amount: 1200 })).toBe(
          "Invoice A-7: 1200",
        );
        expect(formatTemplate("{count} of {count}", { count: 3 })).toBe("3 of 3");

        expect(formatTemplate("Nothing to fill in")).toBe("Nothing to fill in");
        expect(formatTemplate("Nothing to fill in", {})).toBe("Nothing to fill in");

        expect(formatTemplate("Order {id} for {name}", { id: 7 })).toBe("Order 7 for {name}");
      },
    );
  });
});
