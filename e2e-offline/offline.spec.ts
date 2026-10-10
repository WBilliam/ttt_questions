import { expect, test } from "@playwright/test";

test("reopens and starts a quiz after the network is disabled", async ({ context, page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Practice Quiz" })).toBeVisible();
  await page.getByLabel("Κατηγορία").selectOption({ index: 1 });
  await page.getByRole("button", { name: /^Εξάσκηση/ }).click();
  await expect(page.getByText("Ερώτηση", { exact: true })).toBeVisible();
});
