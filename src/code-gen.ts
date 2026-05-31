/**
 * LLM code generator
 * Calls the configured LLM to generate Vue + Tailwind code
 */

import { createLLMClient, Config } from './config.js';
import { DesignTokens } from './token-extractor.js';
import { ComponentSpec } from './component-analyzer.js';
import { LayoutBlueprint, generateBlueprint, blueprintToPrompt, pruneBlueprint } from './layout-engine.js';
import { detectRegions, buildLlmPrompt, renderToHtml, RegionResult } from './region-detector.js';

export interface GenerationResult {
  componentName: string;
  sfcTemplate: string;
  template: string;
  script: string;
  style: string;
  fileName: string;
  usedTokens: {
    colors: string[];
    spacing: number[];
    typography: string[];
  };
}

/**
 * Build the system prompt for code generation
 */
function buildSystemPrompt(
  tokens: DesignTokens,
  framework: string,
  cssFramework: string
): string {
  const colorMap = tokens.colors.map(c => `  ${c.name}: ${c.hex}`).join('\n');
  const spacingTokens = tokens.spacing.map(s => `  ${s.value}px`).join(', ');
  const fontTokens = tokens.typography.map(t => `  ${t.fontFamily} ${t.size}px w-${t.weight}`).join('\n');

  return `You are an expert frontend developer converting design specifications into production-ready ${framework} components with ${cssFramework}.

## Design Tokens (Source of Truth — DO NOT INVENT VALUES)

### Colors
${colorMap || '  (use standard neutral palette)'}

### Spacing Scale
${spacingTokens || '  4, 8, 12, 16, 24, 32, 48, 64px'}

### Typography
${fontTokens || '  Default sans-serif, 14-32px range'}

### Layout
- Grid: ${tokens.layout.gridColumns} columns
- Max container width: ${tokens.layout.maxContainerWidth}px
- Container padding: ${tokens.layout.containerPadding}px
- Grid gap: ${tokens.layout.gridGap}px

### Breakpoints
${tokens.breakpoints.map(b => `  ${b.name}: ${b.value}px`).join('\n')}

### Shadows
${tokens.shadows.map(s => `  ${s.name}: ${s.blurRadius}px blur, ${s.offsetX}px ${s.offsetY}px offset`).join('\n') || '  (none detected)'}

## Rules

1. **ALL colors must use ${cssFramework} color classes or CSS variables from tokens.** Never invent colors.
2. **Typography follows the token scale exactly.** Use font-size tokens from above.
3. **NO fixed width/height classes** (no w-*, h-*). Let content size naturally via flex/grid.
4. **Use semantic HTML tags:** nav, aside, main, section, header, footer, table, button, article, etc. Not just divs.
5. **The layout should be responsive** — use Tailwind's responsive prefixes (sm:, md:, lg:) for breakpoints.
6. Use Vue 3 Composition API with <script setup> syntax.
7. The component must be fully self-contained — no external dependencies beyond ${framework} and ${cssFramework}.
8. For images/icons, use placeholder colored backgrounds with semantic sizing (not pixel-perfect).
9. **For text, use the actual text content from the design spec exactly.** Do not paraphrase or truncate.
10. Handle responsive design with the breakpoint tokens above.

## Output Format

Return ONLY a JSON object with these exact fields:
{
  "template": "<template>...</template> content (the HTML inside template tags)",
  "script": "<script setup lang='ts'>...</script> content (the script inside script tags)",
  "style": "<style scoped>...</style> content (CSS for things Tailwind can't handle)",
  "fileName": "PascalCase.vue",
  "usedTokens": {
    "colors": ["token names used"],
    "spacing": [spacing values used],
    "typography": ["font descriptors used"]
  }
}

IMPORTANT: Return ONLY the JSON object. No markdown code blocks, no explanation text. Start with { and end with }.`;
}

/**
 * Build a design specification from component + tokens.
 * Replaces the old blueprint approach — outputs region layout, exact text, and tokens,
 * letting the LLM generate semantic HTML without fixed sizes.
 */
function buildDesignSpec(component: ComponentSpec, tokens: DesignTokens): string {
  const lines: string[] = [];
  lines.push(`## Component: ${component.name}`);
  lines.push(`Type: ${component.type}`);
  if (component.responsive) lines.push('Responsive: true');
  
  // Layout structure from props
  const structure = (component.props as any)?.structure;
  if (structure?.layout === 'sidebar-main') {
    lines.push('Layout: sidebar + main content area');
    const regions = structure.regions || {};
    const regionList = Object.keys(regions);
    if (regionList.length > 0) {
      lines.push('Regions found: ' + regionList.join(', '));
    }
  } else {
    lines.push('Layout: full-width page');
  }
  lines.push('');

  // Color palette
  lines.push('### Color Palette (use Tailwind equivalents or CSS vars)');
  for (const c of tokens.colors) {
    lines.push(`  ${c.hex} — ${c.name}`);
  }
  lines.push('');

  // Typography
  lines.push('### Typography Scale');
  for (const t of tokens.typography) {
    lines.push(`  ${t.fontFamily} ${t.size}px ${t.weight} (line-height: ${t.lineHeight})`);
  }
  lines.push('');

  // Collect exact text content from all visible layers
  const texts = collectExactTextContent(component.layers);
  if (texts.length > 0) {
    lines.push('### Exact Text Content (copy verbatim — do not paraphrase)');
    for (const { layerName, text, region } of texts) {
      const regionTag = region ? `[${region}] ` : '';
      lines.push(`  ${regionTag}"${text}" (from: ${layerName})`);
    }
    lines.push('');
  }

  // Component type hints derived from layer names
  lines.push('### Component Types Identified');
  const types = detectComponentTypes(component.layers);
  for (const t of types) {
    lines.push(`  - ${t}`);
  }
  lines.push('');

  lines.push('Generate a clean, semantic Vue component. Use the text above EXACTLY.');
  lines.push('Do NOT use fixed w-* or h-* classes. Let content and flex/grid determine sizing.');

  return lines.join('\n');
}

/** Recursively collect all text content from layers with their region context */
function collectExactTextContent(
  layers: import('./sketch-parser.js').SketchLayer[],
  parentName = ''
): { layerName: string; text: string; region: string }[] {
  const results: { layerName: string; text: string; region: string }[] = [];
  for (const l of layers) {
    if (l.textContent && l.textContent.trim()) {
      // Determine region from name
      const name = l.name || '';
      const region = parentName || name;
      results.push({
        layerName: l.name || '(unnamed)',
        text: l.textContent.trim(),
        region,
      });
    }
    if (l.layers?.length) {
      results.push(...collectExactTextContent(l.layers, l.name || parentName));
    }
  }
  return results;
}

/** Collect all text content from layers (used alongside blueprint for exact text mapping) */
function collectBlueprintTexts(
  layers: import('./sketch-parser.js').SketchLayer[]
): string[] {
  const results: string[] = [];
  function walk(ls: import('./sketch-parser.js').SketchLayer[], depth = 0): void {
    for (const l of ls) {
      if (l.textContent && l.textContent.trim()) {
        results.push(`  "${l.textContent.trim()}" [${l.type}] ${l.name ? '(' + l.name + ')' : ''}`);
      }
      if (l.layers?.length) walk(l.layers, depth + 1);
    }
  }
  walk(layers);
  return results;
}

/** Detect component types from layer names */
function detectComponentTypes(layers: import('./sketch-parser.js').SketchLayer[]): string[] {
  const types = new Set<string>();
  const patterns: { re: RegExp; type: string }[] = [
    { re: /(?:导航|nav|navbar|页签|tab)/i, type: 'Tab Navigation' },
    { re: /(?:侧边|sidebar|aside|菜单|menu)/i, type: 'Sidebar Menu' },
    { re: /(?:表格|table|cell|单元格|表头)/i, type: 'Data Table' },
    { re: /(?:指标|card|卡片|kpi)/i, type: 'KPI Card' },
    { re: /(?:图表|chart|柱状|可视化|bar)/i, type: 'Chart / Visualization' },
    { re: /(?:按钮|button|btn)/i, type: 'Button' },
    { re: /(?:输入|input|搜索|search|select|下拉)/i, type: 'Form Input / Dropdown' },
    { re: /(?:分页|pagination)/i, type: 'Pagination' },
    { re: /(?:警告|alert|warning)/i, type: 'Alert / Banner' },
    { re: /(?:头像|avatar|user)/i, type: 'User Info' },
  ];
  
  function walk(ls: import('./sketch-parser.js').SketchLayer[]): void {
    for (const l of ls) {
      for (const p of patterns) {
        if (p.re.test(l.name || '')) {
          types.add(p.type);
          break;
        }
      }
      if (l.layers?.length) walk(l.layers);
    }
  }
  walk(layers);
  return Array.from(types);
}

/**
 * Generate code for a component using the LLM
 */
export async function generateCode(
  component: ComponentSpec,
  tokens: DesignTokens,
  config: Config,
  siblingComponents: ComponentSpec[] = []
): Promise<GenerationResult> {
  const client = createLLMClient(config);

  const systemPrompt = buildSystemPrompt(tokens, config.framework, config.cssFramework);

  // NEW: Use region-based detection instead of blueprint tree
  const regionResult = detectRegions(component.layers, component.name);
  const userMessage = buildLlmPrompt(regionResult);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const payload: Record<string, any> = {
    model: config.llmModel,
    messages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false,
  };

  if (config.enableThinking) {
    payload.max_tokens = config.maxTokens * 2;
  }

  const maxRetries = 1;
  let lastContent = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create(payload as any);
      const content = response.choices?.[0]?.message?.content || '';
      lastContent = content;

      const result = parseJsonResponse(content, component.name);
      if (result) {
        return {
          componentName: component.name,
          sfcTemplate: buildSFCTemplate(result, component.name),
          template: result.template || '',
          script: result.script || '',
          style: result.style || '',
          fileName: result.fileName || `${sanitizeFileName(component.name)}.vue`,
          usedTokens: result.usedTokens || { colors: [], spacing: [], typography: [] },
        };
      }
    } catch (error) {
      lastContent = lastContent || '';
    }
    if (attempt < maxRetries) {
      const delay = 2000;
      console.log(`[codegen] Retry ${attempt + 1}/${maxRetries} for ${component.name} in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Fallback: generate a minimal component from the layer structure
  return buildFallback(component, tokens);
}

/**
 * Try to parse LLM response as JSON, then as markdown code blocks, then as direct HTML.
 * Returns null on complete failure.
 */
function parseJsonResponse(text: string, compName: string): Record<string, any> | null {
  // Strategy 1: Clean and parse strict JSON
  const cleaned = extractJsonFromResponse(text);
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Strategy 2: Extract <template> / <script> / <style> blocks directly
  const templateMatch = text.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
  const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  const styleMatch = text.match(/<style[^>]*>([\s\S]*?)<\/style>/i);

  if (templateMatch) {
    return {
      template: templateMatch[1].trim(),
      script: (scriptMatch?.[1] || '').trim(),
      style: (styleMatch?.[1] || '').trim(),
      fileName: `${sanitizeFileName(compName)}.vue`,
      usedTokens: { colors: [], spacing: [], typography: [] },
    };
  }

  // Strategy 3: Look for template content between triple backticks
  const codeBlockMatch = text.match(/```(?:vue|html)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1].trim();
    if (code.includes('<template') || code.includes('<div')) {
      const tMatch = code.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
      const sMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
      const stMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      return {
        template: (tMatch?.[1] || code).trim(),
        script: (sMatch?.[1] || '').trim(),
        style: (stMatch?.[1] || '').trim(),
        fileName: `${sanitizeFileName(compName)}.vue`,
        usedTokens: { colors: [], spacing: [], typography: [] },
      };
    }
  }

  return null;
}

/**
 * Build a minimal fallback component from layer structure when LLM fails completely.
 */
function buildFallback(component: ComponentSpec, _tokens: DesignTokens): GenerationResult {
  // Use region-based rendering as fallback (fast, deterministic, no LLM)
  const regionResult = detectRegions(component.layers, component.name);
  const sfc = renderToHtml(regionResult);

  return {
    componentName: component.name,
    sfcTemplate: sfc,
    template: sfc,
    script: '',
    style: '',
    fileName: `${sanitizeFileName(component.name)}.vue`,
    usedTokens: { colors: [], spacing: [], typography: [] },
  };
}

/** Check if a blueprint node represents meaningful visual content (fallback path) */
function isMeaningfulNode(node: import('./layout-engine.js').BlueprintNode): boolean {
  if (node.text && node.text.trim().length > 0) return true;
  if (node.children.some(c => isMeaningfulNode(c))) return true;
  // Visible styling makes it meaningful
  const all = [...node.classes];
  if (node.layout) all.push(...inlineLayoutClasses(node.layout));
  if (all.some(c => /^(bg-|border|shadow|rounded)/.test(c))) return true;
  return false;
}

function renderBlueprintNode(node: import('./layout-engine.js').BlueprintNode, depth: number): string {
  // Skip non-meaningful leaf nodes
  if (!isMeaningfulNode(node)) return '';

  const indent = '  '.repeat(depth);
  const allClasses = [...node.classes];
  if (node.layout) {
    allClasses.push(...inlineLayoutClasses(node.layout));
  }
  const classStr = allClasses.length > 0 ? ` class="${allClasses.join(' ')}"` : '';
  const text = node.text ? escapeHtml(node.text) : '';

  if (node.children.length === 0) {
    return `${indent}<${node.tag}${classStr}>${text}</${node.tag}>\n`;
  }

  let html = `${indent}<${node.tag}${classStr}>\n`;
  if (text) html += `${indent}  ${text}\n`;
  for (const child of node.children) {
    html += renderBlueprintNode(child, depth + 1);
  }
  html += `${indent}</${node.tag}>\n`;
  return html;
}

function inlineLayoutClasses(layout: import('./layout-engine.js').LayoutInfo): string[] {
  const c: string[] = [];
  switch (layout.type) {
    case 'flex-row': c.push('flex', 'flex-row'); break;
    case 'flex-col': c.push('flex', 'flex-col'); break;
    case 'grid': c.push('grid'); if (layout.gridCols) c.push(`grid-cols-${layout.gridCols}`); break;
    case 'absolute': c.push('relative'); break;
    case 'flow': break;
  }
  if (layout.gap) c.push(layout.gap);
  // Skip sizing classes (no w-*, h-*, px-*, py-*) — let content determine size
  if (layout.justify) c.push(layout.justify);
  if (layout.items) c.push(layout.items);
  return c;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Repair JSON by escaping control characters that appear inside string literals.
 * Walks character by character, tracking whether we're inside a quoted string.
 */
function repairJson(text: string): string {
  const result: string[] = [];
  let i = 0;
  let inString = false;
  let escapeNext = false;
  const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\uFEFF]/;

  while (i < text.length) {
    const ch = text[i];

    if (escapeNext) {
      result.push(ch);
      escapeNext = false;
      i++;
      continue;
    }

    if (ch === '\\' && inString) {
      result.push(ch);
      escapeNext = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      i++;
      continue;
    }

    if (inString && controlChars.test(ch)) {
      // Replace bad control char with escaped newline
      result.push('\\n');
      i++;
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('');
}

function extractJsonFromResponse(text: string): string {
  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();

  // Try to find JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) text = jsonMatch[0];

  return repairJson(text);
}

/**
 * Recursively strip outer <tagName> wrappers until content no longer
 * starts with <tagName> and ends with </tagName>.
 * Handles nested/duplicate wrappers from LLM JSON serialization.
 */
function stripTagWrapper(html: string, tagName: string): string {
  let t = html.trim();
  // Loop: while the ENTIRE string is wrapped in <tag>...</tag>, strip it
  // Use a non-greedy inner match to prevent cross-pair grabs
  const re = new RegExp(`^<${tagName}[^>]*>([\\s\\S]*)<\\/${tagName}>$`, 'i');
  let prev: string;
  do {
    prev = t;
    const match = t.match(re);
    if (match) {
      t = match[1].trim();
    }
  } while (t !== prev);
  return t;
}

/** Unescape JSON string escapes that LLMs sometimes leave double-encoded */
function unescapeJsonStr(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\r/g, '\r');
}

function buildSFCTemplate(parsed: Record<string, any>, componentName: string): string {
  let template = stripTagWrapper(parsed.template || '', 'template');
  if (!template || template.length < 3) template = '<!-- Generated template -->';
  template = unescapeJsonStr(template);

  // Deduplicate: if the content ALSO starts/ends with <template> wrappers
  // (e.g. LLM puts <template> inside the JSON template field), strip again
  template = stripTagWrapper(template, 'template');

  let script = stripTagWrapper(parsed.script || '', 'script');
  script = unescapeJsonStr(script);

  let style = stripTagWrapper(parsed.style || '', 'style');
  style = unescapeJsonStr(style);

  return `<template>\n${template}\n</template>\n\n<script setup lang="ts">\n${script || '// Generated script'}\n</script>\n\n${style ? `<style scoped>\n${style}\n</style>` : ''}`;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9]/, '_') || 'Component';
}
