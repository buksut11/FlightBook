import { test, expect } from "./fixtures";

test("agent cannot reach settings", async ({ asAgent }) => {
  await asAgent.goto("/settings");
  await expect(asAgent).toHaveURL("/"); // redirected
});

test("agent cannot reach reports", async ({ asAgent }) => {
  await asAgent.goto("/reports");
  await expect(asAgent).toHaveURL("/");
});

test("admin sees the Reports and Settings nav links", async ({ asAdmin }) => {
  await expect(asAdmin.getByRole("link", { name: /reports/i })).toBeVisible();
  await expect(asAdmin.getByRole("link", { name: /settings/i })).toBeVisible();
});
