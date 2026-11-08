import { expect, test, type Page } from "@playwright/test";

const apiUrl = "http://127.0.0.1:8100";
const password = "PaceDemo!2026";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const emailInput = page.locator("#email");
  await emailInput.fill(email);
  await page.locator("#password").fill(password);
  await expect(emailInput).toHaveValue(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".brand").first()).toBeVisible();
}

async function apiJson<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async ({ apiUrl, path }) => {
      const response = await fetch(`${apiUrl}${path}`, {
        credentials: "include",
      });
      if (!response.ok)
        throw new Error(`${response.status} ${await response.text()}`);
      return response.json();
    },
    { apiUrl, path },
  );
}

test.describe.serial("Pace reviewer journeys", () => {
  test("manager imports, reviews assignments, audits an override and reviews AI", async ({
    page,
  }) => {
    await login(page, "manager@pace.demo");
    await expect(
      page.getByRole("heading", { name: /Collections overview/i }),
    ).toBeVisible();
    await expect(page.getByText("Overdue portfolio").first()).toBeVisible();
    await page.screenshot({
      path: "test-results/review/manager-overview.png",
      fullPage: true,
    });

    await page.goto("/imports");
    await page
      .locator('input[type="file"]')
      .setInputFiles(`${process.cwd()}/../../data/sample-overdue-valid.csv`);
    await expect(page.getByText("6 rows reviewed")).toBeVisible();
    await expect(page.getByText("6 valid")).toBeVisible();
    await page.screenshot({
      path: "test-results/review/import-preview.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Confirm import" }).click();
    await expect(page.getByText("Import confirmed")).toBeVisible();
    await page.getByRole("link", { name: /Review assignments/ }).click();
    await expect(
      page.getByRole("heading", { name: "Assignments" }),
    ).toBeVisible();

    const assignments = await apiJson<
      {
        borrower: string;
        officer_id: number | null;
        eligible_officer_ids: number[];
      }[]
    >(page, "/manager/assignments");
    const reassignment = assignments.find(
      (item) =>
        item.eligible_officer_ids.length > 1 &&
        item.eligible_officer_ids.some((id) => id !== item.officer_id),
    );
    expect(reassignment).toBeTruthy();
    const row = page
      .locator(".assignment-row")
      .filter({ has: page.getByText(reassignment!.borrower, { exact: true }) });
    await row.getByRole("button", { name: /Reassign|Assign/ }).click();
    const dialog = page.getByRole("dialog", { name: "Reassign account" });
    const optionValues = await dialog
      .locator("select option")
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter(Boolean),
      );
    expect(optionValues.length).toBeGreaterThan(0);
    const differentOfficer = optionValues.find(
      (value) => Number(value) !== reassignment!.officer_id,
    );
    expect(differentOfficer).toBeTruthy();
    await dialog.locator("select").selectOption(differentOfficer!);
    await dialog
      .getByLabel("Reason")
      .fill("Balance today’s route after validated import");
    await dialog.getByRole("button", { name: "Confirm reassignment" }).click();
    await expect(page.getByRole("status")).toContainText("reassigned");

    await page.goto("/activity");
    await expect(
      page.getByText(/Assignment overridden/i).first(),
    ).toBeVisible();
    await page.goto("/ai-review");
    await expect(
      page.getByRole("heading", { name: "Priority intelligence" }),
    ).toBeVisible();
    await expect(
      page.getByText(/advisory|human controlled/i).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Override" }).first().click();
    await page
      .getByLabel("Rationale")
      .fill("Broken promise and branch review require earlier attention");
    await page.getByRole("button", { name: "Apply audited override" }).click();
    await expect(page.getByText(/Manager #/).first()).toBeVisible();
    await page.screenshot({
      path: "test-results/review/ai-review.png",
      fullPage: true,
    });
  });

  test("officer records a promise and sees it immediately", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["geolocation"], {
      origin: "http://127.0.0.1:3100",
    });
    await context.setGeolocation({ latitude: 22.7196, longitude: 75.8577 });
    await login(page, "rahul@pace.demo");
    const queue = await apiJson<{
      items: { id: number; borrower: string; promise_status: string | null }[];
    }>(page, "/officer/today");
    const loan = queue.items.find((item) => item.promise_status !== "OPEN");
    expect(loan).toBeTruthy();
    await page.goto(`/loans/${loan!.id}`);
    await page.getByRole("button", { name: /Log outcome/ }).click();
    await page
      .getByRole("button", { name: /Promise to pay|भुगतान का वायदा/ })
      .click();
    await page.getByLabel("Promised amount").fill("2500");
    await page.getByLabel("Promise date").fill("2026-11-15");
    await page
      .getByRole("button", { name: /Save outcome|परिणाम सुरक्षित करें/ })
      .click();
    await expect(
      page.getByRole("heading", { name: /Outcome recorded|परिणाम दर्ज हुआ/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Done|पूर्ण/ }).click();
    await page.goto("/promises");
    await page.getByRole("button", { name: "Upcoming" }).click();
    await expect(page.getByText(loan!.borrower).first()).toBeVisible();
  });

  test("offline outcome survives IndexedDB and synchronizes exactly once", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["geolocation"], {
      origin: "http://127.0.0.1:3100",
    });
    await context.setGeolocation({ latitude: 22.7196, longitude: 75.8577 });
    await login(page, "rahul@pace.demo");
    const queue = await apiJson<{ items: { id: number; borrower: string }[] }>(
      page,
      "/officer/today",
    );
    const loan = queue.items.at(-1)!;
    const before = await apiJson<{ history: { event: string }[] }>(
      page,
      `/loans/${loan.id}`,
    );
    await page.goto(`/loans/${loan.id}`);
    await expect(
      page.getByRole("button", { name: /Log outcome/ }),
    ).toBeEnabled();
    await context.setOffline(true);
    await page.getByRole("button", { name: /Log outcome/ }).click();
    await page
      .getByRole("button", { name: /Not reachable|संपर्क नहीं हुआ/ })
      .click();
    await page
      .getByRole("button", { name: /Save outcome|परिणाम सुरक्षित करें/ })
      .click();
    await expect(
      page.getByRole("heading", { name: /Saved on device|फ़ोन में सुरक्षित/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Done|पूर्ण/ }).click();
    const pending = await page.evaluate(async () => {
      const open = indexedDB.open("pace-officer");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction("outbox", "readonly");
      const all = tx.objectStore("outbox").getAll();
      return new Promise<number>((resolve, reject) => {
        all.onsuccess = () =>
          resolve(
            all.result.filter((item) => item.sync_status === "PENDING").length,
          );
        all.onerror = () => reject(all.error);
      });
    });
    expect(pending).toBeGreaterThan(0);

    await context.setOffline(false);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /Good morning|सुप्रभात/ }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect
      .poll(
        async () => {
          const detail = await apiJson<{ history: { event: string }[] }>(
            page,
            `/loans/${loan.id}`,
          );
          return detail.history.filter(
            (event) => event.event === "Outcome: NOT_REACHABLE",
          ).length;
        },
        { timeout: 20_000 },
      )
      .toBe(
        before.history.filter(
          (event) => event.event === "Outcome: NOT_REACHABLE",
        ).length + 1,
      );
    await page.goto("/activity");
    await expect(page.getByText(/Device event · SYNCED/).first()).toBeVisible();
  });

  test("stale offline work becomes an audited conflict after reassignment", async ({
    browser,
  }) => {
    const officerContext = await browser.newContext();
    const managerContext = await browser.newContext();
    const officerPage = await officerContext.newPage();
    const managerPage = await managerContext.newPage();
    await login(officerPage, "rahul@pace.demo");
    await login(managerPage, "manager@pace.demo");

    const queue = await apiJson<{ items: { id: number; borrower: string }[] }>(
      officerPage,
      "/officer/today",
    );
    const assignments = await apiJson<
      {
        id: number;
        borrower: string;
        officer_id: number | null;
        eligible_officer_ids: number[];
      }[]
    >(managerPage, "/manager/assignments");
    const candidate = assignments.find(
      (assignment) =>
        queue.items.some((item) => item.id === assignment.id) &&
        assignment.eligible_officer_ids.some(
          (id) => id !== assignment.officer_id,
        ),
    );
    expect(candidate).toBeTruthy();
    const before = await apiJson<{ history: { event: string }[] }>(
      managerPage,
      `/loans/${candidate!.id}`,
    );

    await officerPage.goto(`/loans/${candidate!.id}`);
    await expect(
      officerPage.getByRole("button", { name: /Log outcome/ }),
    ).toBeEnabled();
    await officerContext.setOffline(true);

    await managerPage.goto("/assignments");
    const row = managerPage
      .locator(".assignment-row")
      .filter({
        has: managerPage.getByText(candidate!.borrower, { exact: true }),
      });
    await row.getByRole("button", { name: "Reassign" }).click();
    const dialog = managerPage.getByRole("dialog", {
      name: "Reassign account",
    });
    const target = candidate!.eligible_officer_ids.find(
      (id) => id !== candidate!.officer_id,
    );
    await dialog.locator("select").selectOption(String(target));
    await dialog
      .getByLabel("Reason")
      .fill("Route ownership changed while officer was offline");
    await dialog.getByRole("button", { name: "Confirm reassignment" }).click();
    await expect(managerPage.getByRole("status")).toContainText("reassigned");

    await officerPage.getByRole("button", { name: /Log outcome/ }).click();
    await officerPage
      .getByRole("button", { name: /Not reachable|संपर्क नहीं हुआ/ })
      .click();
    await officerPage
      .getByRole("button", { name: /Save outcome|परिणाम सुरक्षित करें/ })
      .click();
    await expect(
      officerPage.getByRole("heading", {
        name: /Saved on device|फ़ोन में सुरक्षित/,
      }),
    ).toBeVisible();

    await officerContext.setOffline(false);
    await officerPage.goto("/");
    await expect(
      officerPage.getByRole("heading", { name: /Good morning|सुप्रभात/ }),
    ).toBeVisible();
    await officerPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await officerPage.goto("/activity");
    await expect(
      officerPage.getByText(/Device event · CONFLICT/).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(officerPage.getByText(/reassigned/i).first()).toBeVisible();
    const after = await apiJson<{ history: { event: string }[] }>(
      managerPage,
      `/loans/${candidate!.id}`,
    );
    expect(
      after.history.filter((item) => item.event === "Outcome: NOT_REACHABLE"),
    ).toHaveLength(
      before.history.filter((item) => item.event === "Outcome: NOT_REACHABLE")
        .length,
    );
    await officerContext.close();
    await managerContext.close();
  });

  test("approved English and Hindi reminder templates require explicit simulated delivery", async ({
    page,
  }) => {
    await login(page, "rahul@pace.demo");
    await page.goto("/promises");
    const promises = await apiJson<
      { promise_status: string; promise_date: string }[]
    >(page, "/officer/promises");
    expect(promises.length).toBeGreaterThan(0);
    const first = promises[0];
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const tab =
      first.promise_status === "BROKEN"
        ? "Broken"
        : first.promise_status === "KEPT"
          ? "Kept"
          : first.promise_date > today
            ? "Upcoming"
            : "Due today";
    await page.getByRole("button", { name: tab }).click();
    const firstCard = page.locator(".promise-card").first();
    await firstCard.getByRole("button", { name: /Manage promise/ }).click();
    const dialog = page.getByRole("dialog", { name: "Manage promise" });
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(
      dialog.getByText(/Namaste|reminder of your promised/i).first(),
    ).toBeVisible();
    await expect(dialog.getByText(/Approved template/)).toBeVisible();
    await dialog.getByLabel("Reminder language").selectOption("hi");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByText(/[ऀ-ॿ]/).last()).toBeVisible();
    const send = dialog.getByRole("button", { name: "Simulate delivery" });
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      }).format(new Date()),
    );
    if (hour >= 8 && hour < 19) {
      await expect(send).toBeEnabled();
      await send.click();
      await expect(
        dialog.getByText(/simulated|simulation/i).last(),
      ).toBeVisible();
    } else {
      await expect(send).toBeDisabled();
      await expect(send).toHaveAttribute("title", "Contact allowed 8 AM–7 PM");
    }
  });

  test("manager and officer pages have no horizontal overflow at required viewports", async ({
    browser,
  }) => {
    const sizes = [
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
    ];
    for (const size of sizes) {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      await login(
        page,
        size.width < 768 ? "rahul@pace.demo" : "manager@pace.demo",
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
      expect(consoleErrors).toEqual([]);
      if (size.width === 375)
        await page.screenshot({
          path: "test-results/review/officer-375.png",
          fullPage: true,
        });
      await context.close();
    }
  });
});
