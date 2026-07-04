import { test, expect } from "./fixtures";

test("agent creates a one-way booking and records payment", async ({ asAgent }) => {
  const page = asAgent;
  await page.goto("/bookings/new");

  // Step 0: pick the first bookable flight
  await page.locator("text=/GX\\d+/").first().click();
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 1: customer + passenger
  const uniquePhone = `0900${Date.now().toString().slice(-6)}`;
  await page.getByLabel("Customer phone").fill(uniquePhone);
  await page.getByLabel("Customer name").fill("E2E Test Customer");
  await page.getByPlaceholder("Full name").first().fill("E2E Passenger");
  await page.getByRole("button", { name: /review/i }).click();

  // Step 2: create
  await page.getByRole("button", { name: /create booking/i }).click();
  await expect(page).toHaveURL(/\/bookings\/new\/success/);
  const ref = await page.locator("text=/TKT-/").first().textContent();
  expect(ref).toMatch(/TKT-/);

  // Open the booking and pay
  await page.goto("/bookings");
  await page.getByText(ref!.trim()).click();
  await page.getByRole("button", { name: /record payment/i }).click();
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/confirmed/i).first()).toBeVisible();
});
