/**
 * Quick script: convert all artboards from a sketch page to HTML
 */
import { parseSketch } from '../src/sketch-parser.js';
import { detectRegions, renderToHtml } from '../src/region-detector.js';
import { generateCode } from '../src/code-gen.js';
import { extractDesignTokens } from '../src/token-extractor.js';
import { analyzeComponents } from '../src/component-analyzer.js';
import { loadConfig } from '../src/config.js';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const sketchFile = process.argv[2] || '/Users/coolpanzi/Downloads/0625企康看版.sketch';
  const outputDir = process.argv[3] || './output';
  const pageIdx = parseInt(process.argv[4] || '1', 10);
  const useLlm = process.argv[5] !== 'no-llm';
  
  console.log('📂 Parsing sketch...');
  const sketch = await parseSketch(sketchFile);
  const page = sketch.pages[pageIdx];
  console.log(`   Page: "${page.name}" -> ${page.layers.length} artboards`);
  
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const allComponents: { name: string; html: string }[] = [];
  const config = useLlm ? await loadConfig() : null;
  
  for (const artboard of page.layers) {
    if (artboard.type !== 'artboard') continue;
    
    console.log(`\n📄 Artboard: "${artboard.name}" (${artboard.width}x${artboard.height})`);
    
    let sfc: string;
    
    if (useLlm && config) {
      // Try LLM path
      try {
        const tokens = extractDesignTokens(artboard.layers || []);
        const components = analyzeComponents(artboard.layers || [], artboard.name, 'page');
        console.log('   🤖 Calling LLM...');
        const result = await generateCode(components[0], tokens, config);
        sfc = result.sfcTemplate;
        console.log(`   ✅ LLM generated (${(Buffer.byteLength(sfc)/1024).toFixed(1)} KB)`);
      } catch (err: any) {
        console.log(`   ⚠️ LLM failed: ${err.message}, using fallback`);
        const regionResult = detectRegions(artboard.layers || [], artboard.name);
        sfc = renderToHtml(regionResult);
      }
    } else {
      const regionResult = detectRegions(artboard.layers || [], artboard.name);
      sfc = renderToHtml(regionResult);
    }
    
    const safeName = artboard.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, '-').replace(/-+/g, '-');
    const filePath = path.join(outputDir, `${safeName}.vue`);
    fs.writeFileSync(filePath, sfc);
    
    console.log(`   📁 ${filePath}`);
    
    allComponents.push({ name: artboard.name, html: sfc });
  }
  
  // Generate preview
  console.log(`\n🌐 Generating preview.html...`);
  const previewHtml = buildPreview(allComponents);
  fs.writeFileSync(path.join(outputDir, 'preview.html'), previewHtml);
  console.log(`   ✅ preview.html (${(Buffer.byteLength(previewHtml)/1024).toFixed(1)} KB)`);
  
  console.log('\n🎉 Done! Open: output/preview.html');
}

function buildPreview(components: { name: string; html: string }[]): string {
  const cards = components.map((c, i) => {
    const content = c.html.split('<template>')[1]?.split('</template>')[0]?.trim() || c.html;
    return `
      <div class="card bg-white rounded-lg shadow-sm border overflow-hidden">
        <div class="bg-gray-100 px-3 py-2 border-b text-xs font-semibold text-gray-600">
          #${i+1} ${c.name}
        </div>
        <div class="p-4 min-h-[300px]" style="transform: scale(0.7); transform-origin: top left; width: 143%;">
          ${content}
        </div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sketch2code Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            blue: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
            gray: { 50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827' },
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; }
    .card { transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); }
  </style>
</head>
<body class="p-4">
  <h1 class="text-xl font-bold text-gray-800 mb-4">sketch2code — ${components.length} Pages</h1>
  <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));">
    ${cards}
  </div>
</body>
</html>`;
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
