---
name: playwright
description: "Browser automation with Playwright for testing, scraping, UI scripts, screenshots/PDFs, and performance testing. Use when: (1) Writing automated tests for web applications, (2) Scraping or crawling web data, (3) Creating UI automation scripts, (4) Generating screenshots or PDFs of pages, (5) Running performance or load tests, (6) Any task mentioning browser automation, testing, or web scraping."
---

# Playwright

## Overview

Playwright enables reliable end-to-end testing, web scraping, and browser automation across Chromium, Firefox, and WebKit. It provides fast, reliable execution with features like auto-waiting, network interception, and code generation.

## Quick Start

### Installation

```bash
npm init playwright@latest
# or
npm install -D @playwright/test
npx playwright install
```

### Using the Browser Tool (OpenClaw)

For browser automation via OpenClaw's built-in **browser control server**, **use the browser tool** instead of Playwright:

- Use for: controlling an actual browser, user interactions, taking screenshots
- Read **skills/browser-automation/SKILL.md** (if available) for browser tool patterns

Use **Playwright** when:

- You need to write self-contained test scripts (headless or headed)
- Running test suites (e.g., with @playwright/test)
- Parallel execution across multiple browsers
- Network mocking, intercepting requests/responses
- Generating test reports

---

## Core Capabilities

### 1. Automated Testing

#### Basic Page Test

```typescript
import { test, expect } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("https://example.com");
  await expect(page).toHaveTitle(/Example/);
  await expect(page.locator("h1")).toHaveText("Example Domain");
});
```

#### Form Interaction Test

```typescript
test("login form", async ({ page }) => {
  await page.goto("https://example.com/login");
  await page.fill('[name="username"]', "testuser");
  await page.fill('[name="password"]', "secret");
  await page.click('[type="submit"]');
  await expect(page).toHaveURL(/dashboard/);
});
```

#### Multiple Browsers

```typescript
test.describe("cross-browser", () => {
  test("works in Chrome", async ({ page }) => {
    /* ... */
  });

  test("works in Firefox", async ({ page, browserName }) => {
    test.skip(browserName !== "firefox", "Only run on Firefox");
    /* ... */
  });
});
```

---

### 2. Web Scraping / Crawling

#### Simple Scraping

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");

const data = await page.$$eval(".item", (items) =>
  items.map((item) => ({
    title: item.querySelector("h2")?.textContent,
    price: item.querySelector(".price")?.textContent,
  })),
);

console.log(data);
await browser.close();
```

#### Crawling Multiple Pages

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");

const urls = await page.$$eval(
  "a.link",
  (links) => links.map((a) => a.href).slice(0, 10), // First 10
);

for (const url of urls) {
  await page.goto(url);
  const content = await page.textContent("main");
  // Process content...
}

await browser.close();
```

#### Handling Dynamic Content

```typescript
await page.goto("https://example.com");
await page.waitForSelector(".loaded-data", { timeout: 5000 });

// Wait for network to be idle
await page.waitForLoadState("networkidle");
```

---

### 3. UI Automation Scripts

#### Auto-Fill Forms

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false }); // Watch it run
const page = await browser.newPage();

await page.goto("https://forms.example.com/form");
await page.fill("#name", "John Doe");
await page.fill("#email", "john@example.com");
await page.selectOption("#country", "US");
await page.click("#submit");

await expect(page.locator(".success")).toBeVisible();
```

#### Workflow Automation

```typescript
// Example: Create account, login, post data
async function runWorkflow() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Step 1: Sign up
  await page.goto("https://example.com/signup");
  await page.fill("#username", "newuser");
  await page.fill("#password", "securepass");
  await page.click("#signup-btn");

  // Step 2: Login
  await page.goto("https://example.com/login");
  await page.fill("#username", "newuser");
  await page.fill("#password", "securepass");
  await page.click("#login-btn");

  // Step 3: Post data
  await page.goto("https://example.com/dashboard");
  await page.click("#create-post");
  await page.fill("#title", "Test Post");
  await page.click("#publish");

  await browser.close();
}

runWorkflow();
```

---

### 4. Screenshots & PDFs

#### Full Page Screenshot

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com");
await page.screenshot({ path: "screenshot.png", fullPage: true });
await browser.close();
```

#### PDF Generation

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("https://example.com", { waitUntil: "networkidle" });
await page.pdf({ path: "page.pdf", format: "A4" });
await browser.close();
```

#### Visual Regression Testing

```typescript
import { test, expect } from "@playwright/test";

test("visual comparison", async ({ page }) => {
  await page.goto("https://example.com");
  await expect(page).toHaveScreenshot("homepage.png");
});
```

---

### 5. Performance Testing

#### Measure Page Load

```typescript
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

const start = Date.now();
await page.goto("https://example.com", { waitUntil: "networkidle" });
console.log(`Load time: ${Date.now() - start}ms`);

await browser.close();
```

#### API Response Time Tracking

```typescript
import { test } from "@playwright/test";

test("measure API timing", async ({ page }) => {
  const timings: number[] = [];

  page.on("response", async (response) => {
    if (response.url().includes("/api/")) {
      timings.push(response.timing().responseEnd);
    }
  });

  await page.goto("https://example.com");
  console.log("API timings:", timings);
});
```

#### Load Testing with concurrent browsers

```typescript
import { chromium } from "playwright";

async function simulateUser(userId: number) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://example.com");
  // User actions...
  await browser.close();
}

// Spawn 10 concurrent users
await Promise.all(Array.from({ length: 10 }, (_, i) => simulateUser(i)));
```

---

## Advanced Patterns

### Network Interception (Mocking)

```typescript
test("mock API response", async ({ page }) => {
  await page.route("**/api/data", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mock: true, data: [1, 2, 3] }),
    });
  });

  await page.goto("https://example.com");
  // Will use mocked data
});
```

### File Upload

```typescript
await page.setInputFiles("#file-input", "path/to/file.pdf");
// Or multiple files
await page.setInputFiles("#file-input", ["file1.pdf", "file2.pdf"]);
```

### Download Handling

```typescript
const downloadPromise = page.waitForEvent("download");
await page.click("#download-btn");
const download = await downloadPromise;
await download.saveAs("./saved-file.pdf");
```

### Handling Alerts/Dialogs

```typescript
// Accept alert
page.on("dialog", (dialog) => dialog.accept());

// Dismiss dialog
page.on("dialog", (dialog) => dialog.dismiss());

// Prompt with input
page.on("dialog", async (dialog) => {
  if (dialog.type() === "prompt") {
    await dialog.accept("input value");
  }
});
```

### Waiting Strategies

```typescript
// Wait for element
await page.waitForSelector(".loaded");

// Wait for URL
await page.waitForURL(/dashboard/);

// Wait for timeout (use sparingly)
await page.waitForTimeout(1000);

// Wait for function to return true
await page.waitForFunction(() => {
  return document.querySelectorAll(".item").length > 0;
});
```

---

## Running Tests

### All Tests

```bash
npx playwright test
```

### Specific Test File

```bash
npx playwright test tests/example.spec.ts
```

### Specific Browser

```bash
npx playwright test --project=chromium
```

### With UI Mode (Interactive)

```bash
npx playwright test --ui
```

### Headed Mode (Watch it run)

```bash
npx playwright test --headed
```

---

## Best Practices

1. **Use auto-waiting** – Playwright automatically waits for elements to be ready
2. **Avoid hard-coded waits** – Prefer `waitForSelector` over arbitrary timeouts
3. **Use locators** – `page.locator()` is more robust than chained selectors
4. **Isolate tests** – Each test should be independent
5. **Run in headless by default** – Only use headed for debugging
6. **Use page objects** – Organize page-specific logic for maintainability

---

## Resources

### scripts/

Optional helper scripts for common operations (add as needed).

### references/

Add Playwright docs or API references here if needed.

### assets/

Add test data fixtures or page object templates here if needed.
