import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await page.fill("#email","awanow8@gmail.com"); await page.fill("#password",process.env.ADMIN_PASS);
await page.click("button[type=submit]"); await page.waitForURL("http://localhost:3000/",{timeout:30000});
await page.goto("http://localhost:3000/bookings/new",{waitUntil:"networkidle"});
await page.screenshot({ path: process.env.SCRATCH + "/wizard-step1.png", fullPage: true });
await browser.close();
