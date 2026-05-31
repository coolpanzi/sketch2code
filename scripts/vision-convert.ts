/**
 * Multimodal converter: Sketch artboard → PNG → Gemma vision model → Vue SFC
 * Uses PNG for visual layout + exact extracted text for content accuracy.
 */
import { parseSketch } from '../src/sketch-parser.js';
import { renderArtboardToPng } from '../src/png-renderer.js';
import { detectRegions } from '../src/region-detector.js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const SKETCH_FILE = process.argv[2] || '/Users/coolpanzi/Downloads/0625企康看版.sketch';
const OUTPUT_DIR = process.argv[3] || './output';
const PAGE_IDX = parseInt(process.argv[4] || '1', 10);
const MODEL = 'gemma-4-31b-it-4bit';

async function main() {
  const client = new OpenAI({ baseURL: 'http://127.0.0.1:8888/v1', apiKey: 'omlx1234' });
  
  console.log('📂 Parsing sketch...');
  const sketch = await parseSketch(SKETCH_FILE);
  const page = sketch.pages[PAGE_IDX];
  console.log(`   Page: "${page.name}" — ${page.layers.length} artboards`);
  
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  
  const allComponents: { name: string; html: string }[] = [];
  
  for (const artboard of page.layers) {
    if (artboard.type !== 'artboard') continue;
    
    console.log(`\n📄 "${artboard.name}"`);
    
    // 1. Generate PNG
    const pngBuf = await renderArtboardToPng(artboard.layers || [], artboard.name, '');
    const b64 = pngBuf.toString('base64');
    console.log(`   🖼️  PNG: ${(pngBuf.length / 1024).toFixed(0)} KB`);
    
    // 2. Extract exact text
    const regionResult = detectRegions(artboard.layers || [], artboard.name);
    const texts = regionResult.allText.filter(i => i.text);
    const textList = [...new Set(texts.map(t => t.text))].join('\n');
    
    // 3. Send to multimodal LLM
    console.log('   🤖 Calling gemma-31b...');
    const r = await client.chat.completions.create({
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          { type: 'text', text: `Convert this dashboard to Vue 3 + Tailwind CSS.\n\nUse ONLY these exact Chinese text strings:\n${textList}\n\nThe image shows visual layout. Replace any text in the image with the exact strings above. Use flex/grid for layout. Include sidebar, alert, KPI card with large number, bar chart using the numeric values, data table.\n\nReturn ONLY:\n{"template":"...","script":"...","style":"..."}` },
        ]
      }],
      max_tokens: 4096,
      temperature: 0.1,
    });
    
    // 4. Parse response
    const content = r.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      let template = parsed.template || '';
      // Strip outer <template> wrapper if present
      template = template.replace(/^\s*<template[^>]*>/, '').replace(/<\/template>\s*$/, '');
      
      const sfc = `<template>\n${template}\n</template>\n\n<script setup lang="ts">\n${parsed.script || ''}\n</script>\n\n${parsed.style ? `<style scoped>\n${parsed.style}\n</style>` : ''}`;
      
      const safeName = artboard.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-');
      const filePath = path.join(OUTPUT_DIR, `${safeName}.vue`);
      fs.writeFileSync(filePath, sfc);
      
      console.log(`   ✅ ${(sfc.length / 1024).toFixed(1)} KB → ${path.basename(filePath)}`);
      allComponents.push({ name: artboard.name, html: sfc });
    } else {
      console.log('   ❌ No JSON in response');
    }
  }
  
  // 5. Generate combined preview
  if (allComponents.length > 0) {
    const cards = allComponents.map((c, i) => {
      const tpl = c.html.split('<template>')[1]?.split('</template>')[0]?.trim() || c.html;
      return `<div class="card bg-white rounded-xl shadow-sm border overflow-hidden">
        <div class="bg-gray-100 px-4 py-2 border-b text-sm font-semibold">#${i+1} ${c.name}</div>
        <div class="p-4" style="transform:scale(0.55);transform-origin:top left;width:182%">${tpl}</div>
      </div>`;
    }).join('\n');
    
    const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>sketch2code — Vision Preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:system-ui,sans-serif;background:#f1f5f9}.card:hover{box-shadow:0 10px 25px -5px rgba(0,0,0,0.1)}</style>
</head>
<body class="p-4">
<h1 class="text-xl font-bold text-gray-800 mb-4">sketch2code — ${allComponents.length} Pages (${MODEL})</h1>
<div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(500px,1fr))">${cards}</div>
</body></html>`;
    
    fs.writeFileSync(path.join(OUTPUT_DIR, 'preview.html'), previewHtml);
    console.log(`\n🌐 preview.html (${(previewHtml.length / 1024).toFixed(1)} KB)`);
  }
  
  console.log(`\n🎉 Done! Open: ${OUTPUT_DIR}/preview.html`);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
