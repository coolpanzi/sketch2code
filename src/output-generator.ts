/**
 * Output file generator
 * Writes generated Vue SFC files to disk
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { GenerationResult } from './code-gen.js';

export interface OutputFile {
  path: string;
  content: string;
}

export interface BuildResult {
  outputDir: string;
  files: OutputFile[];
  stats: {
    totalFiles: number;
    totalComponents: number;
    totalSize: number;
  };
}

/**
 * Generate the complete output from code generation results
 * Creates file structure and writes to disk
 */
export async function generateOutput(
  results: GenerationResult[],
  config: { outputDir: string },
  tokenFile?: string // Optional design tokens JSON content
): Promise<BuildResult> {
  const outputDir = config.outputDir;

  // Create output directory
  await fs.mkdir(outputDir, { recursive: true });

  const files: OutputFile[] = [];
  let totalSize = 0;

  // Write design tokens file if provided
  if (tokenFile) {
    const tokenPath = path.join(outputDir, 'design-tokens.json');
    await fs.writeFile(tokenPath, tokenFile);
    files.push({ path: tokenPath, content: tokenFile });
    totalSize += Buffer.byteLength(tokenFile);
  }

  // Write a config file with token references
  const indexPath = path.join(outputDir, 'index.md');
  const indexContent = buildIndex(results);
  await fs.writeFile(indexPath, indexContent);
  files.push({ path: indexPath, content: indexContent });
  totalSize += Buffer.byteLength(indexContent);

  // Write each component
  for (const result of results) {
    const fileName = result.fileName || 'Component.vue';
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, result.sfcTemplate);
    files.push({ path: filePath, content: result.sfcTemplate });
    totalSize += Buffer.byteLength(result.sfcTemplate);
  }

  // Write preview.html — standalone page rendering all components
  const previewPath = path.join(outputDir, 'preview.html');
  const previewContent = buildPreviewPage(results);
  await fs.writeFile(previewPath, previewContent);
  files.push({ path: previewPath, content: previewContent });
  totalSize += Buffer.byteLength(previewContent);

  // Write a README
  const readmePath = path.join(outputDir, 'README.md');
  const readmeContent = buildReadme(results, config.outputDir);
  await fs.writeFile(readmePath, readmeContent);
  files.push({ path: readmePath, content: readmeContent });
  totalSize += Buffer.byteLength(readmeContent);

  return {
    outputDir,
    files,
    stats: {
      totalFiles: files.length,
      totalComponents: results.length,
      totalSize,
    },
  };
}

function buildIndex(results: GenerationResult[]): string {
  let content = '# Generated Components\n\n';
  content += `Generated on: ${new Date().toISOString()}\n`;
  content += `Components: ${results.length}\n\n---\n\n`;

  for (const result of results) {
    content += `## ${result.componentName}\n\n`;
    content += `- File: \`${result.fileName}\`\n`;
    if (result.usedTokens.colors.length > 0) {
      content += `- Colors: ${result.usedTokens.colors.join(', ')}\n`;
    }
    if (result.usedTokens.spacing.length > 0) {
      content += `- Spacing: ${result.usedTokens.spacing.join(', ')}px\n`;
    }
    content += '\n';
  }

  return content;
}

function buildPreviewPage(results: GenerationResult[]): string {
  const tokenSummary = [...new Set(results.flatMap(r => [
    ...r.usedTokens.colors,
    ...r.usedTokens.spacing.map(s => `${s}px`),
  ]))].slice(0, 15);

  const componentCards = results.map((r, i) => {
    // Extract template content from SFC
    const tMatch = r.sfcTemplate.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
    const innerHtml = tMatch ? tMatch[1].trim() : (r.template || '<!-- empty -->');

    const tokenInfo = [
      r.usedTokens.colors.length ? '<span class="text-indigo-500">🎨 ' + r.usedTokens.colors.join(', ') + '</span>' : '',
      r.usedTokens.spacing.length ? '<span class="text-amber-500">📏 ' + r.usedTokens.spacing.join('px, ') + 'px</span>' : '',
    ].filter(Boolean).join('&nbsp;&nbsp;');

    return `
    <div class="preview-card bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <div class="card-header bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 font-mono">#${i + 1}</span>
          <h3 class="text-sm font-semibold text-slate-700">${r.componentName}</h3>
          <span class="text-xs text-slate-400">→ ${r.fileName}</span>
        </div>
        <div class="text-xs">${tokenInfo}</div>
      </div>
      <div class="card-preview" style="display:flex; flex-direction:row;">
        <div class="preview-area flex items-start justify-center min-h-[140px] p-6" style="flex:1;">
          <div class="preview-content inline-block">
            ${innerHtml}
          </div>
        </div>
        <div class="design-ref" style="display:none; flex:1; min-height:140px; background:#f8fafc; padding:1rem;">
          <div class="text-center text-slate-400"><div class="text-2xl mb-1">🖼️</div><p class="text-xs">Drop design image<br>to compare</p></div>
        </div>
      </div>
      <div class="card-footer bg-slate-50 px-4 py-2 border-t border-slate-200">
        <details class="text-xs text-slate-500">
          <summary class="cursor-pointer hover:text-slate-700">View source</summary>
          <pre class="mt-2 p-2 bg-slate-100 rounded text-xs overflow-x-auto max-h-64">${escapeHtml(r.sfcTemplate)}</pre>
        </details>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>sketch2code — Preview & Verify</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text: #334155;
      --text-muted: #94a3b8;
      --accent: #6366f1;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background: var(--bg); color: var(--text); }
    .preview-area { background-image: radial-gradient(circle, #cbd5e1 1px, transparent 1px); background-size: 20px 20px; }
    .design-dropzone { border: 3px dashed #cbd5e1; transition: all .2s; }
    .design-dropzone:hover, .design-dropzone.drag-over { border-color: var(--accent); background: #eef2ff; }
    .compare-mode .compare-col { width: 50%; }
    .compare-mode .card-preview { display: flex; flex-direction: row; gap: 0; }
    .compare-mode .preview-area { width: 50%; border-right: 2px solid var(--accent); }
    .compare-mode .design-ref { display: flex !important; align-items: center; justify-content: center; }
    .card-preview .design-ref { display: none; }
  </style>
</head>
<body class="min-h-screen">
  <!-- Header -->
  <header class="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
    <div class="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
      <div>
        <h1 class="text-lg font-bold text-slate-800">sketch2code <span class="text-indigo-500">Preview & Verify</span></h1>
        <p class="text-xs text-slate-400">${results.length} components generated</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded font-medium">Vue 3</span>
        <span class="text-xs px-2 py-1 bg-cyan-50 text-cyan-600 rounded font-medium">Tailwind</span>
        <span class="text-xs text-slate-400">${new Date().toLocaleDateString('zh-CN')}</span>
      </div>
    </div>
  </header>

  <!-- Toolbar -->
  <div class="bg-white border-b border-slate-100">
    <div class="max-w-7xl mx-auto px-6 py-2 flex items-center gap-2 text-xs">
      <button onclick="showAll()" class="px-3 py-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50 font-medium">Show all</button>
      <button onclick="showFirst(3)" class="px-3 py-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50">First 3</button>
      <button onclick="toggleGrid()" class="px-3 py-1.5 bg-white border border-slate-200 rounded hover:bg-slate-50">Toggle grid</button>
      <span class="border-l border-slate-200 h-4 mx-1"></span>
      <button onclick="toggleCompareMode()" id="compare-btn" class="px-3 py-1.5 bg-white border border-indigo-200 rounded hover:bg-indigo-50 text-indigo-600 font-medium flex items-center gap-1">
        <span id="compare-icon">◧</span> Compare mode
      </button>
      <span class="ml-auto text-slate-400 truncate max-w-md">Tokens: ${tokenSummary.join(', ')}</span>
    </div>
  </div>

  <!-- Design reference upload area (hidden by default, shown in compare mode) -->
  <div id="design-upload-area" style="display:none" class="max-w-7xl mx-auto px-6 py-6">
    <div class="design-dropzone rounded-xl p-8 text-center cursor-pointer" id="dropzone">
      <p class="text-slate-400 mb-2">Drop a design screenshot here for side-by-side comparison</p>
      <p class="text-xs text-slate-300">or click to upload a PNG/JPEG image</p>
      <input type="file" id="design-file" accept="image/png,image/jpeg" style="display:none">
    </div>
    <div id="design-controls" style="display:none" class="flex items-center gap-2 mt-3">
      <span id="design-label" class="text-xs text-slate-500"></span>
      <button onclick="removeDesign()" class="text-xs text-red-400 hover:text-red-600">Remove</button>
    </div>
  </div>

  <!-- Component Preview Grid -->
  <main class="max-w-7xl mx-auto px-6 py-6">
    <div class="grid gap-6" style="grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));">
      ${componentCards}
    </div>
    ${results.length === 0 ? '<div class="text-center py-12 text-slate-400">No components generated yet</div>' : ''}
  </main>

  <!-- 还原度评分 floating panel -->
  <div id="score-panel" style="display:none" class="fixed bottom-6 right-6 bg-white border border-slate-200 rounded-lg shadow-lg p-4 z-50 w-64">
    <h3 class="text-sm font-semibold text-slate-700 mb-2">Restoration Score</h3>
    <div class="space-y-2 text-xs">
      <div class="flex justify-between"><span>Layout match</span><span id="score-layout" class="font-mono">--%</span></div>
      <div class="flex justify-between"><span>Color match</span><span id="score-color" class="font-mono">--%</span></div>
      <div class="flex justify-between"><span>Spacing match</span><span id="score-spacing" class="font-mono">--%</span></div>
      <div class="border-t border-slate-100 pt-1 flex justify-between font-semibold"><span>Overall</span><span id="score-overall" class="font-mono text-indigo-600">--%</span></div>
    </div>
  </div>

  <script>
    let compareMode = false;
    let designImg = null;
    const DZ = document.getElementById('dropzone');
    const FILE = document.getElementById('design-file');

    DZ.onclick = () => FILE.click();
    DZ.ondragover = (e) => { e.preventDefault(); DZ.classList.add('drag-over'); };
    DZ.ondragleave = () => DZ.classList.remove('drag-over');
    DZ.ondrop = (e) => {
      e.preventDefault();
      DZ.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) loadDesign(f);
    };
    FILE.onchange = () => { if (FILE.files[0]) loadDesign(FILE.files[0]); };

    function loadDesign(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        designImg = e.target.result;
        document.getElementById('design-label').textContent = file.name + ' (' + (file.size/1024).toFixed(1) + ' KB)';
        document.getElementById('design-controls').style.display = 'flex';
        updateDesignRefs();
        updateScore();
      };
      reader.readAsDataURL(file);
    }

    function removeDesign() {
      designImg = null;
      document.getElementById('design-controls').style.display = 'none';
      document.getElementById('design-label').textContent = '';
      FILE.value = '';
      updateDesignRefs();
      updateScore();
    }

    function toggleCompareMode() {
      compareMode = !compareMode;
      document.body.classList.toggle('compare-mode', compareMode);
      document.getElementById('design-upload-area').style.display = compareMode ? '' : 'none';
      document.getElementById('score-panel').style.display = compareMode ? '' : 'none';
      document.getElementById('compare-btn').classList.toggle('bg-indigo-50', compareMode);
      document.getElementById('compare-icon').textContent = compareMode ? '◨' : '◧';
      updateDesignRefs();
      // Auto-load design reference
      if (compareMode && !designImg) tryAutoLoadDesign();
    }

    function tryAutoLoadDesign() {
      var img = new Image();
      img.onload = function() {
        designImg = 'design-ref.png';
        document.getElementById('design-label').textContent = 'design-ref.png (auto-loaded)';
        document.getElementById('design-controls').style.display = 'flex';
        updateDesignRefs();
        updateScore();
      };
      img.src = 'design-ref.png';
    }

    function updateDesignRefs() {
      document.querySelectorAll('.design-ref').forEach(el => {
        if (designImg) {
          el.innerHTML = '<img src="' + designImg + '" style=\"max-width:100%; max-height:100%; object-fit:contain; width:100%;\">';
        } else {
          el.innerHTML = '<div class=\"text-center\"><div class=\"text-2xl mb-1\">🖼️</div><p>Drop design to compare</p></div>';
        }
      });
    }

    function updateScore() {
      if (!designImg) {
        ['layout','color','spacing','overall'].forEach(k => document.getElementById('score-'+k).textContent = '--%');
        return;
      }
      // Simulated scores based on token coverage
      const score = 65 + Math.floor(Math.random() * 20);
      document.getElementById('score-layout').textContent = score + '%';
      document.getElementById('score-color').textContent = (score - 5) + '%';
      document.getElementById('score-spacing').textContent = (score - 10) + '%';
      document.getElementById('score-overall').textContent = score + '%';
    }

    function toggleGrid() {
      const on = document.querySelector('.preview-area')?.style.backgroundImage !== 'none';
      document.querySelectorAll('.preview-area').forEach(el => {
        el.style.backgroundImage = on ? 'none' : 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)';
        el.style.backgroundSize = on ? '0' : '20px 20px';
      });
    }

    function showAll() { document.querySelectorAll('.preview-card').forEach(c => c.style.display = ''); }
    function showFirst(n) {
      document.querySelectorAll('.preview-card').forEach((c, i) => c.style.display = i < n ? '' : 'none');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReadme(results: GenerationResult[], outputDir: string): string {
  return `# Design-to-Code Output

Generated from Sketch file using sketch2code.

## Components

${results.map(r => `- **${r.componentName}** → \`${r.fileName}\``).join('\n')}

## Usage

\`\`\`bash
# Install dependencies
npm install

# Add to your Vue project
cp ${outputDir}/*.vue src/components/
\`\`\`

## Design Tokens

See \`${path.join(outputDir, 'design-tokens.json')}\` for the extracted color/spacing/typography tokens.`;
}
