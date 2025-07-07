// // debug.ts - Једноставан скрипт за тестирање приступа сајту
// import { chromium } from "playwright";

// async function testWebsiteAccess() {
//   const browser = await chromium.launch({ 
//     headless: false, // Видећеш шта се дешава
//     args: [
//       '--no-sandbox',
//       '--disable-dev-shm-usage',
//       '--disable-blink-features=AutomationControlled',
//       '--disable-web-security'
//     ]
//   });
  
//   const context = await browser.newContext({
//     userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//     extraHTTPHeaders: {
//       'Accept-Language': 'sr-RS,sr;q=0.9,en;q=0.8',
//       'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
//     }
//   });
  
//   const page = await context.newPage();
  
//   try {
//     console.log("🔍 Тестирам приступ сајту...");
    
//     const testUrl = "https://backapalankavesti.com/backa-palanka/";
//     console.log(`   Отварам: ${testUrl}`);
    
//     const response = await page.goto(testUrl, { 
//       waitUntil: "domcontentloaded", 
//       timeout: 30000 
//     });
    
//     console.log(`   ✓ Статус: ${response?.status()}`);
//     console.log(`   ✓ Наслов: ${await page.title()}`);
    
//     // Чекај да се страница учита
//     await page.waitForTimeout(3000);
    
//     // Провери основне селекторе
//     const selectors = [
//       'a',
//       'article',
//       'h1, h2, h3',
//       '.entry-title',
//       '.post-title'
//     ];
    
//     for (const selector of selectors) {
//       try {
//         const count = await page.$eval(selector, (els: Element[]) => els.length);
//         console.log(`   ${selector}: ${count} елемената`);
//       } catch (e) {
//         console.log(`   ${selector}: грешка - ${e}`);
//       }
//     }
    
//     // Провери све линкове
//     const allLinks = await page.$eval('a', (as: Element[]) => 
//       as.map((a: Element) => ({
//         href: (a as HTMLAnchorElement).href,
//         text: a.textContent?.trim(),
//         className: (a as HTMLElement).className
//       })).filter((link: any) => link.href && link.href.includes('backapalankavesti.com'))
//     );
    
//     console.log(`\n📰 Пронађено ${allLinks.length} интерних линкова:`);
//     allLinks.slice(0, 10).forEach((link: any, i: number) => {
//       console.log(`   ${i + 1}. ${link.text?.slice(0, 50) || 'Без текста'} - ${link.href}`);
//     });
    
//     // Тестирај отварање једног чланка
//     if (allLinks.length > 0) {
//       const firstArticle = allLinks[0];
//       console.log(`\n📖 Тестирам отварање чланка: ${firstArticle.href}`);
      
//       await page.goto(firstArticle.href, { waitUntil: "domcontentloaded" });
//       await page.waitForTimeout(2000);
      
//       // Провери елементе чланка
//       const articleTitle = await page.textContent('h1');
//       console.log(`   Наслов чланка: ${articleTitle}`);
      
//       const articleContent = await page.textContent('article, .entry-content, .post-content');
//       console.log(`   Дужина садржаја: ${articleContent?.length || 0} карактера`);
//     }
    
//     console.log("\n✅ Тест завршен - притисни Enter да затвориш браузер...");
    
//     // Чекај да корисник притисне Enter
//     await new Promise(resolve => {
//       process.stdin.once('data', resolve);
//     });
    
//   } catch (error) {
//     console.error("❌ Грешка:", error);
//   } finally {
//     await browser.close();
//   }
// }

// // Покрени тест
// testWebsiteAccess().catch(console.error);