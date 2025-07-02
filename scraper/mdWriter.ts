import { promises as fs } from 'fs';
import { join } from 'path';
import slugify from 'slugify';

export async function writeArticle(
  { title, body, date }: { title: string; body: string; date: string },
  category: string
) {
  const dir = join('output', 'news', category);
  await fs.mkdir(dir, { recursive: true });

  const slug = slugify(title, { lower: true, strict: true }).slice(0, 60);
  const filePath = join(dir, `${date}-${slug}.md`);

  const md = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: ${date}\ncategory: ${category}\n---\n\n${body}\n`;
  await fs.writeFile(filePath, md, 'utf8');
}
