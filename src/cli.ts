#!/usr/bin/env node
/**
 * CLI entry point for sketch2code
 * Uses the three-phase LayeredRestorationEngine:
 *   Phase 1: Property → CSS (algorithmic, zero LLM)
 *   Phase 2: Structure generation (algorithmic or LLM)
 *   Phase 3: Layout conversion (absolute → flex/grid)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, saveConfig, printConfig } from './config.js';
import { parseSketchFile } from './core/parser/SketchFileParser.js';
import { LayeredRestorationEngine } from './core/codegen/LayeredRestorationEngine.js';
import { LayerType, ArtboardLayer, BlendMode } from './core/types.js';

// ─── Version ───────────────────────────────────────────────────────────────
const VERSION = '0.2.0';

// ─── Usage ─────────────────────────────────────────────────────────────────
const USAGE = `
sketch2code ${VERSION} — Convert Sketch designs to Vue 3 components

Commands:
  init              Initialize configuration
  config            Show current configuration
  set <key> <value> Set a configuration value
  convert           Convert a .sketch file to Vue SFC

Options:
  --help, -h        Show help
  --version, -v     Show version

Examples:
  sketch2code init
  sketch2code set llmBaseUrl http://127.0.0.1:8888
  sketch2code convert design.sketch
  sketch2code convert design.sketch -o ./output
  sketch2code convert design.sketch --llm
`;

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(USAGE.trim());
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE.trim());
      break;

    case '--version':
    case '-v':
    case 'version':
      console.log(VERSION);
      break;

    case 'init':
      await cmdInit();
      break;

    case 'config':
      await cmdConfig();
      break;

    case 'set':
      await cmdSet(args.slice(1));
      break;

    case 'convert':
      await cmdConvert(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run `sketch2code --help` for usage.');
      process.exit(1);
  }
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function cmdInit() {
  console.log('🔧 Initializing sketch2code...\n');
  const config = await loadConfig();

  if (!config.apiKey) {
    console.log('⚠️  API key not set. Set it with: sketch2code set apiKey your-key');
    console.log('   If using local oMLX, the default key "omlx1234" works.\n');
  }

  printConfig(config);
  console.log('✅ sketch2code initialized. Run `sketch2code convert <file.sketch>` to get started.');
}

async function cmdConfig() {
  const config = await loadConfig();
  printConfig(config);
}

async function cmdSet(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: sketch2code set <key> <value>');
    console.log('Available keys: llmModel, llmBaseUrl, apiKey, temperature, maxTokens, outputDir');
    return;
  }

  const [key, value] = args;
  const config = await loadConfig();

  if (!(key in config)) {
    console.error(`Unknown key: ${key}`);
    console.log('Available keys:', Object.keys(config).join(', '));
    return;
  }

  const typedValue: any = parseValue(value);
  (config as any)[key] = typedValue;

  await saveConfig(config);
  console.log(`✅ Config updated: ${key} = ${typedValue}`);
}

function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (!isNaN(Number(value))) return Number(value);
  return value;
}

// ─── Convert Command ───────────────────────────────────────────────────────

async function cmdConvert(args: string[]) {
  const subArgs = args[0] === 'convert' ? args.slice(1) : args;

  const { values, positionals } = parseArgs({
    args: subArgs,
    options: {
      output: { type: 'string', short: 'o' },
      llm: { type: 'boolean' },
      'no-layout': { type: 'boolean' },
      page: { type: 'string', short: 'p' },
      artboard: { type: 'string', short: 'a' },
      tolerance: { type: 'string', short: 't' },
    },
    strict: false,
  });

  const inputFile = positionals[0];

  if (!inputFile) {
    console.error('❌ No input file specified.');
    console.log('Usage: sketch2code convert <file.sketch> [options]');
    console.log('Options:');
    console.log('  -o, --output <dir>     Output directory (default: ./output)');
    console.log('  --llm                  Enable LLM structure generation');
    console.log('  --no-layout            Skip layout conversion (keep absolute positioning)');
    console.log('  -p, --page <name>      Page to convert (default: first page)');
    console.log('  -a, --artboard <n>     Artboard index to convert (default: all)');
    console.log('  -t, --tolerance <px>   Layout alignment tolerance (default: 4)');
    return;
  }

  const config = await loadConfig();
  const outputDir = (values.output as string) || config.outputDir || './output';

  console.log('🚀 sketch2code — Converting .sketch to Vue 3\n');

  // ── Step 1: Parse the .sketch file ──────────────────────────────────────
  console.log('📂 Step 1: Parsing .sketch file...');
  const parseResult = await parseSketchFile(inputFile);

  if (!parseResult.success || !parseResult.file) {
    console.error('❌ Parse failed:');
    for (const err of parseResult.errors) {
      console.error(`   [${err.stage}] ${err.message}`);
    }
    process.exit(1);
  }

  const sketchFile = parseResult.file;
  const pageNames = sketchFile.pages.map(p => p.name);
  console.log(`   Pages:      ${pageNames.join(', ')}`);
  console.log(`   Artboards:  ${sketchFile.pages.reduce((n, p) => n + p.artboards.length, 0)}`);
  console.log(`   Parse time: ${parseResult.metadata.parseTime}ms\n`);

  if (sketchFile.pages.length === 0) {
    console.error('❌ No pages found in the .sketch file.');
    process.exit(1);
  }

  // ── Step 2: Select page ─────────────────────────────────────────────────
  let targetPage = sketchFile.pages[0];
  if (values.page) {
    const pageName = values.page as string;
    const found = sketchFile.pages.find(p => p.name === pageName || p.name.includes(pageName));
    if (found) {
      targetPage = found;
    } else {
      const idx = parseInt(pageName, 10);
      if (!isNaN(idx) && idx >= 0 && idx < sketchFile.pages.length) {
        targetPage = sketchFile.pages[idx];
      } else {
        console.error(`❌ Page "${pageName}" not found. Available: ${pageNames.join(', ')}`);
        process.exit(1);
      }
    }
  }
  console.log(`📄 Page: "${targetPage.name}"\n`);

  // ── Step 3: Collect artboards to convert ────────────────────────────────
  let artboards: ArtboardLayer[] = targetPage.artboards;

  if (artboards.length === 0) {
    // If no artboards, treat top-level layers as a single artboard
    console.log('   No artboards found, using page layers directly.\n');
    const fakeArtboard: ArtboardLayer = {
      id: 'page-root',
      name: targetPage.name,
      type: LayerType.ARTBOARD,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: BlendMode.NORMAL,
      rotation: 0,
      rect: {
        x: 0,
        y: 0,
        width: targetPage.metadata.actualDimensions.width,
        height: targetPage.metadata.actualDimensions.height,
      },
      cornerRadius: 0,
      clipsContent: false,
      layers: targetPage.layers,
    };
    artboards = [fakeArtboard];
  }

  // Filter by -a flag
  if (values.artboard) {
    const artArg = values.artboard as string;
    if (artArg === 'all') {
      // Convert all
    } else {
      const idx = parseInt(artArg, 10);
      if (!isNaN(idx) && idx >= 0 && idx < artboards.length) {
        artboards = [artboards[idx]];
      } else {
        const found = artboards.find(a => a.name.includes(artArg));
        if (found) {
          artboards = [found];
        } else {
          console.error(`❌ Artboard "${artArg}" not found.`);
          process.exit(1);
        }
      }
    }
  }

  console.log(`🖼️  Converting ${artboards.length} artboard(s)...\n`);

  // ── Step 4: Run LayeredRestorationEngine on each artboard ───────────────
  const engine = new LayeredRestorationEngine();
  const useLLM = !!values.llm;
  const enableLayout = !(values['no-layout'] as boolean);

  const outputFiles: string[] = [];

  for (let i = 0; i < artboards.length; i++) {
    const artboard = artboards[i];
    const componentName = artboard.name || `Artboard-${i + 1}`;

    console.log(`${'─'.repeat(50)}`);
    console.log(`[${i + 1}/${artboards.length}] ${componentName} (${Math.round(artboard.rect.width)}×${Math.round(artboard.rect.height)}px)\n`);

    const result = await engine.restore(componentName, artboard, {
      enableLayoutConversion: enableLayout,
      useLLM,
    });

    // Assemble Vue SFC
    const sfc = assembleSFC(result.template, result.style, result.script);

    // Write file
    const outPath = path.join(outputDir, result.fileName);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, sfc, 'utf-8');

    outputFiles.push(outPath);
    console.log(`   ✅ Written: ${outPath} (${(Buffer.byteLength(sfc) / 1024).toFixed(1)} KB)\n`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`${'─'.repeat(50)}`);
  console.log(`🎉 Done! Generated ${outputFiles.length} component(s) in ${outputDir}`);
  for (const f of outputFiles) {
    console.log(`   - ${f}`);
  }
}

// ─── SFC Assembly ──────────────────────────────────────────────────────────

function assembleSFC(template: string, style: string, script?: string): string {
  const parts: string[] = [];

  parts.push(`<template>`);
  parts.push(template);
  parts.push(`</template>`);

  if (script && script.trim()) {
    parts.push('');
    parts.push(`<script setup lang="ts">`);
    parts.push(script);
    parts.push(`</script>`);
  }

  parts.push('');
  parts.push(`<style scoped>`);
  parts.push(style);
  parts.push(`</style>`);

  return parts.join('\n');
}

// ─── Run ───────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
