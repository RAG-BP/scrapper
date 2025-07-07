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

function log(category: string, message: string) {
  console.log(`[${category}] ${message}`);
}

async function debugPage(page: import("playwright").Page, category: string) {
  try {
    const html = await page.content();
    await fs.writeFile(`debug_${category}.html`, html, 'utf8');
    log("DEBUG", `Saved debug HTML for ${category}`);
  } catch (error) {
    log("DEBUG", `Failed to save debug HTML: ${error}`);
  }
}

async function getAllArticleLinks(page: import("playwright").Page, categoryUrl: string, categoryName: string) {
  const articleLinks = new Set<string>();
  
  try {
    log(categoryName, `Loading page: ${categoryUrl}`);
    await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const pageTitle = await page.title();
    log(categoryName, `Page title: ${pageTitle}`);

    let loadMoreAttempts = 0;
    const maxLoadMoreAttempts = 10;

    while (loadMoreAttempts < maxLoadMoreAttempts) {
      try {
        const loadMoreButton = await page.$('button:has-text("Učitaj više"), button:has-text("Još vesti"), a:has-text("Učitaj više"), a:has-text("Još vesti")');
        
        if (loadMoreButton) {
          log(categoryName, `Found "Učitaj više" button (attempt ${loadMoreAttempts + 1})`);
          await loadMoreButton.click();
          await page.waitForTimeout(3000);
          await page.waitForLoadState("domcontentloaded");
          loadMoreAttempts++;
        } else {
          log(categoryName, `No more "Učitaj više" buttons found`);
          break;
        }
      } catch (error) {
        log(categoryName, `Error clicking "Učitaj više": ${error}`);
        break;
      }
    }

    const linkSelectors = [
      "article h2 a",
      "article .entry-title a",
      "h3.entry-title a", 
      "h3.td-module-title a",
      "div.td-module-title a",
      "div.tdb-module-title a",
      ".post-title a",
      ".entry-title a",
      "h2 a",
      "h3 a"
    ];

    for (const selector of linkSelectors) {
      try {
        const links = await page.$$eval(selector, (elements) => 
          elements
            .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
            .map((el) => el.href)
            .filter((href) => 
              href && 
              href.includes('backapalankavesti.com') &&
              !href.includes('/category/') &&
              !href.includes('/author/') &&
              !href.includes('/page/')
            )
        );

        if (links.length > 0) {
          links.forEach(link => articleLinks.add(link));
          log(categoryName, `Found ${links.length} links with selector: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (articleLinks.size === 0) {
      try {
        const allLinks = await page.$$eval('a[href]', (elements) => 
          elements
            .filter((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
            .map((el) => el.href)
            .filter((href) => 
              href && 
              href.includes('backapalankavesti.com') &&
              !href.includes('/category/') &&
              !href.includes('/author/') &&
              !href.includes('/page/')
            )
        );
        allLinks.forEach(link => articleLinks.add(link));
        log(categoryName, `Found ${allLinks.length} links with generic selector`);
      } catch (error) {
        log(categoryName, `Error with generic selector: ${error}`);
      }
    }

  } catch (error) {
    log(categoryName, `Error loading category page: ${error}`);
    await debugPage(page, categoryName);
  }

  return Array.from(articleLinks);
}

async function extractArticle(page: import("playwright").Page, articleUrl: string) {
  const titleSelectors = [
    "h1.entry-title",
    "h1.post-title", 
    "h1.single-post-title",
    "h1.td-pb-title",
    "h1.tdb-title-text",
    "h1",
    ".entry-title",
    ".post-title"
  ];

  const dateSelectors = [
    "time.entry-date",
    "time.published",
    "time.updated", 
    "span.td-post-date time",
    "time[datetime]",
    ".entry-date",
    ".post-date"
  ];

  const bodySelectors = [
    "div.td-post-content",
    "div.tdb-block-inner", 
    "div.entry-content",
    "article .entry-content",
    ".post-content",
    ".article-content",
    "main article"
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
    url: articleUrl 
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
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'sr-RS',
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();

  for (const { name, url } of categories) {
    log("CATEGORY", `Starting: ${name}`);

    try {
      const articleLinks = await getAllArticleLinks(page, url, name);
      log(name, `Total articles found: ${articleLinks.length}`);

      if (articleLinks.length === 0) {
        await debugPage(page, name);
        continue;
      }

      for (const [index, href] of articleLinks.entries()) {
        try {
          log(name, `Processing article ${index + 1}/${articleLinks.length}`);
          await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(1000);
          
          const article = await extractArticle(page, href);
          
          if (!article.body || article.body.length < 50) {
            log(name, `Skipping (low content): ${article.title}`);
            continue;
          }
          
          await writeArticle(article, name);
          log(name, `Saved: ${article.title.substring(0, 50)}...`);
          
        } catch (error) {
          log(name, `Error processing article: ${error}`);
        }
      }
    } catch (error) {
      log("ERROR", `Category failed: ${name} - ${error}`);
    }
  }

  await browser.close();
  log("DONE", "Finished scraping all categories");
})();