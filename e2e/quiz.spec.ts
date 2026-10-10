import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("starts a practice session on a narrow phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Περιεχόμενο επίδειξης/)).toBeVisible();
  await page.getByLabel("Κατηγορία").selectOption({ index: 1 });
  await page.getByRole("button", { name: /^Εξάσκηση/ }).click();
  await expect(page.getByText("Ερώτηση", { exact: true })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow-x", "hidden");
});

test("home screen has no automatically detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Κατηγορία")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("enlarges and dismisses a question image", async ({ page }) => {
  await page.addInitScript(() => {
    Math.random = () => 0.99;
  });
  await page.goto("/");
  await page.getByLabel("Κατηγορία").selectOption({ label: "Δείγμα — Βασικές Αρχές Προπόνησης" });
  await page.getByRole("button", { name: /^Εξάσκηση/ }).click();
  await page.getByRole("button", { name: "Μεγέθυνση εικόνας" }).click();
  await expect(page.getByRole("dialog", { name: "Μεγεθυμένη εικόνα" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Μεγεθυμένη εικόνα" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Μεγέθυνση εικόνας" })).toBeFocused();
});

test("completes an exam and shows a full review", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Κατηγορία").selectOption({ label: "Δείγμα — Ασφάλεια" });
  await page.getByRole("button", { name: /^Εξέταση/ }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.locator(".choices button").first().click();
    await page.getByRole("button", { name: index === 3 ? "Ολοκλήρωση" : "Επόμενη" }).click();
  }
  await expect(page.getByText("Αποτέλεσμα εξέτασης")).toBeVisible();
  await expect(page.locator(".review-card")).toHaveCount(4);
});
