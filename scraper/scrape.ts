import { chromium } from "playwright";
import { promises as fs } from "fs";
import { join } from "path";
import slugify from "slugify";

const categories = [
  { name: "Бачка Паланка", url: "https://backapalankavesti.com/backa-palanka/" },
  { name: "Инфо", url: "https://backapalankavesti.com/info/" },
  { name: "Хроника", url: "https://backapalankavesti.com/hronika/" },
  { name: "Спорт", url: "https://backapalankavesti.com/sport/" },
  { name: "Спорт и рекреација", url: "https://backapalankavesti.com/sport-i-rekreacija/" },
  { name: "Дешавања / Догађаји", url: "https://backapalankavesti.com/desavanja-dogadjaji/" },
  { name: "Друштво", url: "https://backapalankavesti.com/drustvo/" },
  { name: "Култура", url: "https://backapalankavesti.com/kultura/" },
  { name: "Помени и сећања", url: "https://backapalankavesti.com/pomeni-i-secanja/" },
  { name: "Општина", url: "https://backapalankavesti.com/opstina/" },
  { name: "Занимљивости", url: "https://backapalankavesti.com/zanimljivosti/" }
] as const;

function log(cat: string, msg: string) {
  console.log(`   [${cat}] ${msg}`);
}

async function getAllArticleLinks(page: import("playwright").Page, baseUrl: string) {
  const links = new Set<string>();
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl}page/${currentPage}/`;
    log("PAGE", `Checking page ${currentPage}: ${pageUrl}`);

    try {
      await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(3000);

      const title = await page.title();
      if (title.includes("404") || title.includes("Not Found")) {
        log("PAGE", `Page ${currentPage} doesn't exist (404)`);
        hasNextPage = false;
        break;
      }

      // Multiple selectors to find article links
      const selectors = [
        'article a',
        '.td-module-container a',
        '.tdb_module_loop a',
        '.td-module-title a',
        'h3.entry-title a',
        'h2.entry-title a',
        'h3 a',
        'h2 a'
      ];

      for (const selector of selectors) {
        try {
          const pageLinks = await page.$$eval(selector, (elements) => 
            elements
              .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
              .map((el) => el.href)
              .filter((href) => 
                href && 
                href.includes('backapalankavesti.com') && 
                !href.includes('/category/') &&
                !href.includes('/author/') &&
                !href.includes('/page/') &&
                !href.includes('/tag/') &&
                href.split('/').filter(Boolean).length > 4
              )
          );

          if (pageLinks.length > 0) {
            pageLinks.forEach(link => links.add(link));
            log("PAGE", `Found ${pageLinks.length} links using selector "${selector}"`);
            break;
          }
        } catch (err) {
          continue;
        }
      }

      if (links.size === 0) {
        log("PAGE", `No articles found on page ${currentPage}`);
        hasNextPage = false;
        break;
      }

      const nextPageLink = await page.$('a.next.page-numbers, .page-nav a:has-text("Следећа")');
      if (!nextPageLink) {
        hasNextPage = false;
      } else {
        currentPage++;
      }

      if (currentPage > 50) {
        log("PAGE", "Reached maximum of 50 pages");
        hasNextPage = false;
      }

    } catch (err) {
      log("ERROR", `Error scraping page ${currentPage}: ${err}`);
      hasNextPage = false;
    }
  }

  return Array.from(links);
}

async function extractArticle(page: import("playwright").Page, url: string) {
  const titleSelectors = [
    "h1.entry-title",
    "h1.post-title", 
    "h1.td-post-title",
    "h1.td-pb-title",
    "h1.tdb-title-text",
    "h1",
    ".entry-title",
    ".post-title",
    ".td-post-title",
    ".tdb-title-text"
  ];

  const dateSelectors = [
    "time.entry-date",
    "time.published",
    "time.updated", 
    "span.td-post-date time",
    "time[datetime]",
    ".entry-date",
    ".post-date",
    ".td-post-date",
    ".tdb-date"
  ];

  const bodySelectors = [
    "div.td-post-content",
    "div.tdb-block-inner", 
    "div.entry-content",
    "article .entry-content",
    ".post-content",
    ".article-content",
    "main article",
    ".td-post-text-content",
    ".tdb_single_content"
  ];

  let title = "";
  let dateRaw = "";
  let body = "";

  for (const selector of titleSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        title = (await element.textContent())?.trim() || "";
        if (title) break;
      }
    } catch (e) {
      continue;
    }
  }

  for (const selector of dateSelectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        dateRaw = (await element.getAttribute("datetime")) || 
                  (await element.textContent())?.trim() || "";
        if (dateRaw) break;
      }
    } catch (e) {
      continue;
    }
  }

  for (const selector of bodySelectors) {
    try {
      const paragraphs = await page.$$eval(`${selector} p`, (ps) =>
        ps.map(p => p.textContent?.trim() || "").filter(Boolean)
      );
      
      if (paragraphs.length > 0) {
        body = paragraphs.join("\n\n");
        break;
      }
      
      const element = await page.$(selector);
      if (element) {
        const text = (await element.textContent())?.trim() || "";
        if (text && text.length > 50) {
          body = text;
          break;
        }
      }
    } catch (e) {
      continue;
    }
  }

  let dateIso = "";
  if (dateRaw) {
    try {
      const date = new Date(dateRaw);
      if (!isNaN(date.getTime())) {
        dateIso = date.toISOString().slice(0, 10);
      }
    } catch (e) {}
  }

  return { 
    title: title || "Без наслова", 
    date: dateIso || new Date().toISOString().slice(0, 10), 
    body: body || "", 
    url 
  };
}

async function writeArticle(
  { title, date, body, url }: { title: string; date: string; body: string; url: string },
  category: string
) {
  const dir = join("output", "news", category);
  await fs.mkdir(dir, { recursive: true });

  const slug = slugify(title, { lower: true, strict: true }).slice(0, 60);
  const fileName = `${date}-${slug || 'article'}.md`;
  const filePath = join(dir, fileName);

  const md = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
category: ${category}
url: ${url}
---

${body}
`;
  
  await fs.writeFile(filePath, md, "utf8");
}

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });
  
  const page = await context.newPage();

  for (const { name, url } of categories) {
    console.log(`\n▶  Processing category: ${name}`);

    try {
      log(name, "Collecting links from all pages...");
      const allLinks = await getAllArticleLinks(page, url);
      
      if (allLinks.length === 0) {
        log(name, "No articles found - trying alternative approach...");
        
        // Try alternative approach for category pages
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
        const html = await page.content();
        await fs.writeFile(`debug_${name.replace(/[^a-zA-Z0-9]/g, '_')}.html`, html, 'utf8');
        
        log(name, `Saved debug HTML for manual inspection: debug_${name.replace(/[^a-zA-Z0-9]/g, '_')}.html`);
        continue;
      }

      log(name, `Found total ${allLinks.length} articles`);

      for (const [index, href] of allLinks.entries()) {
        try {
          log(name, `[${index + 1}/${allLinks.length}] Processing: ${href}`);
          
          await page.goto(href, { waitUntil: "networkidle", timeout: 60000 });
          await page.waitForTimeout(2000);
          
          const art = await extractArticle(page, href);
          
          if (!art.body || art.body.length < 50) {
            log(name, `[${index + 1}] Skipped (low content): ${href}`);
            continue;
          }
          
          await writeArticle(art, name);
          log(name, `[${index + 1}] ✓ Saved: ${art.title.slice(0, 50)}...`);
          
        } catch (err) {
          log(name, `[${index + 1}] ✖ Error: ${err}`);
        }
      }

    } catch (err) {
      console.error(`   ✖ Critical error in category ${name}:`, err);
    }
  }

  await browser.close();
  console.log("\n🏁 Scraping completed");
})();