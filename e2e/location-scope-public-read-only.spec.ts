import path from "node:path";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";

type BrowserHarness = typeof globalThis & {
  mountLocationScopePicker: () => void;
  rejectStaleLocationRequest?: () => void;
};

const marketA = {
  id: "market-a",
  name: "Denver",
  country_code: "US",
  admin_area1: "CO",
  locality: "Denver",
  cellCount: 1,
  activeCellCount: 1,
};
const marketB = {
  ...marketA,
  id: "market-b",
  name: "Boulder",
  locality: "Boulder",
};

function cellFor(market: typeof marketA, suffix = "80202") {
  return {
    id: `cell-${market.id}`,
    market_id: market.id,
    country_code: "US",
    admin_area1: market.admin_area1,
    admin_area2: null,
    locality: market.locality,
    postal_code: suffix,
    postal_code_normalized: suffix,
    cell_type: "postal_code",
    cell_label: `${market.name} ${suffix}`,
    is_active: 1,
    coverage: { total: 0, done: 0, failed: 0, remaining: 0, completed: false },
  };
}

let componentBundle = "";

test.beforeAll(async () => {
  const root = process.cwd();
  const result = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { LocationScopePicker } from "./src/components/location-scope-picker.tsx";

        globalThis.mountLocationScopePicker = () => {
          createRoot(document.getElementById("root")).render(
            <LocationScopePicker
              value={{ state: "CO", counties: [], zipCodes: [] }}
              categories={["dentist"]}
              onChange={() => {}}
            />
          );
        };
      `,
      loader: "tsx",
      resolveDir: root,
    },
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"' },
    format: "iife",
    platform: "browser",
    plugins: [{
      name: "location-scope-action-mocks",
      setup(esbuild) {
        esbuild.onResolve({ filter: /^@\/lib\/crawl\/actions$/ }, () => ({
          path: "location-scope-action-mocks",
          namespace: "location-scope-test",
        }));
        esbuild.onLoad({ filter: /.*/, namespace: "location-scope-test" }, () => ({
          contents: `
            const loaders = () => globalThis.__locationScopeLoaders;
            export const getPlannerMarketsAction = (...args) => loaders().getMarkets(...args);
            export const getPlannerCellsAction = (...args) => loaders().getCells(...args);
            export const getPlannerCountiesAction = (...args) => loaders().getCounties(...args);
            export const getPlannerZipCodesAction = (...args) => loaders().getZipCodes(...args);
          `,
          loader: "js",
        }));
        esbuild.onResolve({ filter: /^@\/lib\/geography$/ }, () => ({
          path: path.join(root, "src/lib/geography.ts"),
        }));
      },
    }],
    write: false,
  });
  componentBundle = result.outputFiles[0]?.text ?? "";
});

async function mountHarness(page: Page) {
  await page.addScriptTag({ content: componentBundle });
  await page.evaluate(() => (globalThis as BrowserHarness).mountLocationScopePicker());
}

test("market failure exits loading and the inline retry restores location cells", async ({ page }) => {
  const cell = cellFor(marketA);
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(({ market, cellValue }) => {
    let marketAttempts = 0;
    (globalThis as typeof globalThis & { __locationScopeLoaders: unknown }).__locationScopeLoaders = {
      getMarkets: async () => {
        marketAttempts += 1;
        if (marketAttempts === 1) throw new Error("market outage");
        return [market];
      },
      getCells: async () => [cellValue],
      getCounties: async () => [],
      getZipCodes: async () => [],
    };
  }, { market: marketA, cellValue: cell });
  await mountHarness(page);

  await expect(page.getByRole("alert")).toContainText("Discovery markets could not be loaded.");
  await expect(page.getByText("No active cells for this market yet.")).toBeVisible();
  await page.getByRole("button", { name: "Retry location data" }).click();

  await expect(page.getByText(cell.cell_label)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("active cell failure exits loading and retries without refreshing the page", async ({ page }) => {
  const cell = cellFor(marketA);
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(({ market, cellValue }) => {
    let cellCalls = 0;
    (globalThis as typeof globalThis & { __locationScopeLoaders: unknown }).__locationScopeLoaders = {
      getMarkets: async () => [market],
      getCells: async () => {
        cellCalls += 1;
        if (cellCalls === 1) throw new Error("cell outage");
        return [cellValue];
      },
      getCounties: async () => [],
      getZipCodes: async () => [],
    };
  }, { market: marketA, cellValue: cell });
  await mountHarness(page);

  await expect(page.getByRole("alert")).toContainText("Postal cells for this area could not be loaded.");
  await expect(page.getByText("No active cells for this market yet.")).toBeVisible();
  await page.getByRole("button", { name: "Retry location data" }).click();

  await expect(page.getByText(cell.cell_label)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a stale failed cell request cannot replace the newly selected area's success", async ({ page }) => {
  const cellA = cellFor(marketA);
  const cellB = cellFor(marketB, "80301");
  await page.setContent('<main><div id="root"></div></main>');
  await page.evaluate(({ firstMarket, secondMarket, firstCell, secondCell }) => {
    let firstMarketCalls = 0;
    let rejectStale: ((reason?: unknown) => void) | undefined;
    (globalThis as typeof globalThis & { __locationScopeLoaders: unknown }).__locationScopeLoaders = {
      getMarkets: async () => [firstMarket, secondMarket],
      getCells: async (marketId: string) => {
        if (marketId === firstMarket.id) {
          firstMarketCalls += 1;
          if (firstMarketCalls === 1) {
            return new Promise((_, reject) => { rejectStale = reject; });
          }
          return [firstCell];
        }
        return [secondCell];
      },
      getCounties: async () => [],
      getZipCodes: async () => [],
    };
    (globalThis as BrowserHarness).rejectStaleLocationRequest = () => rejectStale?.(new Error("stale failure"));
  }, {
    firstMarket: marketA,
    secondMarket: marketB,
    firstCell: cellA,
    secondCell: cellB,
  });
  await mountHarness(page);

  await page.getByLabel("Area").selectOption(marketB.id);
  await expect(page.getByText(cellB.cell_label)).toBeVisible();
  await page.evaluate(() => (globalThis as BrowserHarness).rejectStaleLocationRequest?.());

  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(cellB.cell_label)).toBeVisible();
});
