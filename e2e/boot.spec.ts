import { expect, test } from "@playwright/test";

test("the app boots into the shell and shows a page heading", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
