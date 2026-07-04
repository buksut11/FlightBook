import { test, expect } from "./fixtures";

test("redirects anonymous users to login", async ({ page }) => {
  await page.goto("/bookings");
  await expect(page).toHaveURL(/\/login/);
});

test("rejects wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toContainText(/incorrect/i);
});

test("admin can sign in and see the dashboard", async ({ asAdmin }) => {
  await expect(asAdmin.getByRole("heading", { name: /welcome/i })).toBeVisible();
});
