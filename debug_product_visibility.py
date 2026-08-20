import asyncio
import os
import json
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        await page.goto("http://localhost:8080")
        title = await page.inner_text("h1")
        print(f"Homepage Title: {title}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
