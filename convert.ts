/**
 * sketch2code — Single best pipeline
 * Qwen3.6 VLM (LM Studio GGUF) + algorithm precision data
 *
 * Usage: npx tsx convert.ts [sketch-file] [-o output-dir]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────
const API = 'http://127.0.0.1:1234/v1/chat/completions';
const KEY = 'sk-lm-8fYmBq6V:hEB1baJBQzm9Hw5Iio2y';
const MODEL = 'qwen/qwen3.6-35b-a3b';

// ── API ─────────────────────────────────────────────────────────────────────
async function callVLM(sys: string, user: string, imageB64?: string): Promise<string> {
  const content: any[] = [{ type: 'text', text: user }];
  if (imageB64) content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } });

  const resp = await fetch(API, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content }], temperature: 0.1, max_tokens: 32768 }),
  });
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Prompt builders ─────────────────────────────────────────────────────────
const SYSTEM = `你是世界级前端工程师。根据设计稿截图生成 Vue 3 SFC。核心要求:
1. 颜色: 使用 :root 中定义的 CSS 变量
2. 布局: 只用 flexbox/grid，禁用 position:absolute
3. 标签: 语义化 (aside/header/main/section/table)
4. 重复: v-for 处理列表/表格/标签页
5. 图表: 内联 SVG
6. 中文: 截图中的文字原样保留，一字不改
7. 输出: 只输出原始 Vue SFC，不要 markdown`;

function buildUserPrompt(name: string, w: number, h: number, texts: string[], colors: string[]): string {
  const nums = texts.filter(t => /\d/.test(t)).slice(0, 20).join(' | ');
  const cols = colors.slice(0, 8).join(', ');
  return `设计稿: "${name}" ${w}×${h}px\n主色: ${cols}\n关键数据: ${nums}\n生成完整 Vue 3 SFC。只输出代码。`;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const sketchPath = args.find(a => a.endsWith('.sketch')) || '0625企康看版.sketch';
  const outIdx = args.indexOf('-o');
  const outputDir = outIdx >= 0 ? args[outIdx + 1] : './output';

  console.log(`🎯 sketch2code → ${sketchPath}`);

  // Dynamic imports
  const { parseSketchFile } = await import('./src/core/parser/SketchFileParser.js');
  const { extractStructuredData } = await import('./src/structured-extractor.js');

  const parsed = await parseSketchFile(sketchPath);
  if (!parsed.success || !parsed.file) { console.error('Parse failed'); return; }
  const file = parsed.file;

  await fs.promises.mkdir(outputDir, { recursive: true });

  // Extract preview image
  const previewPath = path.join(path.dirname(sketchPath), 'output', 'previews', 'preview.png');
  const imageB64 = fs.existsSync(previewPath) ? fs.readFileSync(previewPath).toString('base64') : '';

  let idx = 0;
  for (const page of file.pages) {
    for (const artboard of (page.artboards.length > 0 ? page.artboards : [])) {
      const name = artboard.name || `Artboard-${idx + 1}`;
      const w = Math.round(artboard.rect?.width || 1440);
      const h = Math.round(artboard.rect?.height || 900);

      // Extract structured data
      const structured = extractStructuredData(file, idx);
      const texts = structured.raw.textItems.map(t => t.content);
      const colors = structured.raw.colors.map(c => c.hex);

      console.log(`[${idx + 1}] ${name} (${w}×${h}) — ${texts.length} texts, ${colors.length} colors`);

      const t0 = Date.now();
      let sfc = await callVLM(SYSTEM, buildUserPrompt(name, w, h, texts, colors), imageB64);

      // Clean markdown fences
      const m = sfc.match(/```(?:vue|html)?\s*([\s\S]*?)```/);
      if (m) sfc = m[1].trim();

      const outPath = path.join(outputDir, `${idx + 1}-${name.replace(/[^\w\u4e00-\u9fff-]/g, '-')}.vue`);
      await fs.promises.writeFile(outPath, sfc, 'utf-8');
      console.log(`   ✅ ${sfc.length} chars in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${path.basename(outPath)}\n`);

      idx++;
    }
  }
  console.log(`✅ Done → ${outputDir}`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
