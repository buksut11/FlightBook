import { test as base, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

export const test = base.extend<{ asAdmin: Page; asAgent: Page }>({
  asAdmin: async ({ page }, use) => {
    await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await use(page);
  },
  asAgent: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, process.env.E2E_AGENT_EMAIL!, process.env.E2E_AGENT_PASSWORD!);
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
