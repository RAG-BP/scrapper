
// ─────────────────────────────────────────────
// scrape.ts (самосталан фајл — само копирај у свој пројекат)
//   ▸ Дефинише листу категорија (ћирилица за име, латиница у URL‑у)
//   ▸ За сваку категорију узима прву страницу, прикупља линкове на вести
//   ▸ Обрађује сваки линк → наслов, датум, текст
//   ▸ Чува Markdown у output/news/<категорија>/<датум>-<slug>.md
// ─────────────────────────────────────────────
import { chromium } from "playwright";
import { promises as fs } from "fs";
import { join } from "path";
import slugify from "slugify";

// --- Списак категорија ---
// Напомена: линкови на сајту немају „/category/“ у путањи,
// па су URL‑ови директно /hronika/ итд.
const categories = [
  { name: "Бачка Паланка",         url: "https://backapalankavesti.com/backa-palanka/" },
  { name: "Инфо",                  url: "https://backapalankavesti.com/info/" },
  { name: "Хроника",               url: "https://backapalankavesti.com/hronika/" },
  { name: "Спорт",                 url: "https://backapalankavesti.com/sport/" },
  { name: "Спорт и рекреација",    url: "https://backapalankavesti.com/sport-i-rekreacija/" },
  { name: "Дешавања / Догађаји",   url: "https://backapalankavesti.com/desavanja-dogadjaji/" },
  { name: "Друштво",               url: "https://backapalankavesti.com/drustvo/" },
  { name: "Култура",               url: "https://backapalankavesti.com/kultura/" },
  { name: "Помени и сећања",       url: "https://backapalankavesti.com/pomeni-i-secanja/" },
  { name: "Општина",               url: "https://backapalankavesti.com/opstina/" },
  { name: "Занимљивости",          url: "https://backapalankavesti.com/zanimljivosti/" }
] as const;

// --- Помоћна лог функција ---
function log(cat: string, msg: string) {
  console.log(`   [${cat}] ${msg}`);
}

// --- Екстракција чланка ---
async function extractArticle(page: import("playwright").Page) {
  // Различити селектори који се јављају у TagDiv/Newspaper WP темама
  const titleSel = [
    "h1.entry-title",
    "h1.post-title",
    "h1.single-post-title",
    "h1.td-pb-title",
    "h1.tdb-title-text"
  ].join(", ");

  const dateSel = [
    "time.entry-date",
    "time.published",
    "time.updated",
    "span.td-post-date time"
  ].join(", ");

  const bodyWrappers = [
    "div.td-post-content",   // Newspaper classic
    "div.tdb-block-inner",  // TagDiv builder
    "div.entry-content",    // WP default
    "article .entry-content"
  ].join(", ");

  const title = (await page.textContent(titleSel))?.trim() || "Без наслова";

  // Датум: datetime атрибут или fallback на видљив текст
  let dateRaw = await page.getAttribute(dateSel, "datetime");
  if (!dateRaw) dateRaw = (await page.textContent(dateSel))?.trim() || "";
  const dateIso = dateRaw ? new Date(dateRaw).toISOString().slice(0, 10) : "";

  // Тело: сви <p> унутар познатих wrapper‑а
  let body = await page.$$eval(`${bodyWrappers} p`, ps =>
    ps.map(p => p.textContent?.trim() || "").filter(Boolean).join("\n\n")
  );
  // Fallback: узми комплетан текст wrapper‑а ако <p> није нађен
  if (!body) {
    body = (await page.textContent(bodyWrappers))?.trim() || "";
  }

  return { title, date: dateIso, body };
}

// --- Запис Markdown фајла ---
async function writeArticle(
  { title, date, body }: { title: string; date: string; body: string },
  category: string
) {
  const dir = join("output", "news", category);
  await fs.mkdir(dir, { recursive: true });

  const slug = slugify(title, { lower: true, strict: true }).slice(0, 60);
  const filePath = join(dir, `${date}-${slug}.md`);

  const md = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: ${date}\ncategory: ${category}\n---\n\n${body}\n`;
  await fs.writeFile(filePath, md, "utf8");
}

// --- Главни ток ---
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Селектор који хвата линкове на лист‑страници (покрива више WP тема)
  const linkSelector = [
    "article h2 a",
    "article .entry-title a",
    "h3.entry-title a",
    "h3.td-module-title a",
    "div.td-module-title a",
    "div.tdb-module-title a"
  ].join(", ");

  for (const { name, url } of categories) {
    console.log(`▶  Категорија: ${name}`);

    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (err) {
      console.error(`   ✖ Не могу да отворим ${url}`, err);
      continue;
    }

    const links = await page.$$eval(linkSelector, as => as.map(a => (a as HTMLAnchorElement).href));
    log(name, `пронађено линкова: ${links.length}`);

    for (const href of links) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded" });
        const art = await extractArticle(page);
        if (!art.body) {
          log(name, `прескочено (празно тело): ${href}`);
          continue;
        }
        await writeArticle(art, name);
        log(name, `сачувано: ${art.title}`);
      } catch {
        log(name, `грешка на ${href}`);
      }
    }
  }

  await browser.close();
  console.log("🏁 Завршено");
})();
