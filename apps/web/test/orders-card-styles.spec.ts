import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { qc } from "../../api/src/test-support/qase-case";

/**
 * The order card is a container: the detail link, the buttons and the draft form
 * inside it answer their own presses. A press state on the card itself scales the
 * whole row under the pointer, which is what a tester saw as a card that `pumps`
 * on every click, and it also moves the control the person is aiming at while the
 * click is still travelling.
 *
 * The stylesheet is the only home of that behaviour, so the case reads the file
 * instead of a rendered node: jsdom never applies CSS, and a computed style
 * assertion would pass whatever the sheet happens to say. The file lives outside
 * `src` because the application project deliberately type-checks without node
 * types, and this case needs the filesystem.
 */
const ordersCss = readFileSync(new URL("../src/styles/orders.css", import.meta.url), "utf8");
const cardRule = /\.order-list-card(?<state>:[a-z-]+)?\s*\{(?<body>[^}]*)\}/gu;

function cardRules(): { state: string; body: string }[] {
  return [...ordersCss.matchAll(cardRule)].map((match) => ({
    state: match.groups?.state ?? "",
    body: match.groups?.body ?? "",
  }));
}

describe("Web", () => {
  describe("Orders list", () => {
    it(
      qc("web.orders.card-press", "keeps the order card in place when it is pressed"),
      () => {
        const rules = cardRules();

        expect(rules.map((rule) => rule.state)).toEqual(["", ":hover"]);
        expect(rules[0].body).not.toContain("transform");
        // The hover answer stays: the defect was the press, not the pointer feedback.
        expect(rules[1].body).toContain("box-shadow");
      },
    );
  });
});
