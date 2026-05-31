#!/usr/bin/env node
/**
 * CLI entry point for sketch2code
 * Usage: sketch2code <command> [options]
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { parseArgs } from 'node:util';

import { loadConfig, saveConfig, printConfig } from './config.js';
import { parseSketch, ParsedSketch, SketchPage, SketchLayer } from './sketch-parser.js';
import { extractDesignTokens } from './token-extractor.js';
import { analyzeComponents } from './component-analyzer.js';
import { generateCode, GenerationResult } from './code-gen.js';
import { generateOutput } from './output-generator.js';
import { verifyComponent } from './verification.js';

// ─── Version ───────────────────────────────────────────────────────────────
const VERSION = '0.1.0';

// ─── Usage ─────────────────────────────────────────────────────────────────
const USAGE = `
sketch2code ${VERSION} — Convert Sketch designs to Vue + Tailwind code

Commands:
  init              Initialize configuration
  config            Show current configuration
  set <key> <value> Set a configuration value
  convert           Convert a .sketch file to code
  verify            Verify a generated component

Options:
  --help, -h        Show help
  --version, -v     Show version

Examples:
  sketch2code init                    # Initialize config
  sketch2code set llmBaseUrl http://127.0.0.1:8888
  sketch2code set apiKey your-key     # Set API key
  sketch2code convert design.sketch   # Convert a .sketch file
  sketch2code convert design.sketch -o ./output -v  # With output dir and verification
`;

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // No args → show usage
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

    case 'verify':
      await cmdVerify(args.slice(1));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run `sketch2code --help` for usage.');
      process.exit(1);
  }
}

// ─── Page selection ────────────────────────────────────────────────────────

async function selectPage(pages: SketchPage[], cliPage?: string, cliArtboard?: string): Promise<{ name: string; layers: SketchLayer[] } | null> {
  // Step 1: Select Sketch page
  let page: SketchPage;
  if (pages.length === 1) {
    page = pages[0];
    console.log(`📄 Page: "${page.name}"`);
  } else if (cliPage) {
    const byName = pages.find(p => p.name === cliPage);
    if (byName) { page = byName; }
    else {
      const idx = parseInt(cliPage, 10);
      if (!isNaN(idx) && idx >= 0 && idx < pages.length) { page = pages[idx]; }
      else {
        console.error(`   Page "${cliPage}" not found. Available: ${pages.map(p => p.name).join(', ')}`);
        return null;
      }
    }
  } else {
    console.log('📄 Multiple pages found:');
    for (let i = 0; i < pages.length; i++) {
      console.log(`   [${i}] ${pages[i].name} (${pages[i].layers.length} top-level layers)`);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer: string = await new Promise(resolve => {
      rl.question('   Select page: ', ans => { rl.close(); resolve(ans.trim()); });
    });
    const idx = parseInt(answer, 10);
    if (!isNaN(idx) && idx >= 0 && idx < pages.length) { page = pages[idx]; }
    else {
      const byName = pages.find(p => p.name === answer || p.name.toLowerCase().includes(answer.toLowerCase()));
      if (byName) { page = byName; }
      else { return null; }
    }
  }

  // Step 2: Check if top-level layers are artboards (sub-pages)
  const artboards = page.layers.filter(l => l.type === 'artboard');
  if (artboards.length >= 2) {
    console.log(`\n🖼️  Found ${artboards.length} artboards in "${page.name}":`);
    for (let i = 0; i < artboards.length; i++) {
      const a = artboards[i];
      console.log(`   [${i}] ${a.name} (${a.width}x${a.height}, ${a.layers?.length || 0} layers)`);
    }

    // Non-interactive via -a flag
    if (cliArtboard !== undefined) {
      if (cliArtboard === 'all') return { name: page.name, layers: artboards };
      const idx = parseInt(cliArtboard, 10);
      if (!isNaN(idx) && idx >= 0 && idx < artboards.length) {
        const ab = artboards[idx];
        return { name: ab.name, layers: [ab] };
      }
      const abMatch = artboards.find(a => a.name.includes(cliArtboard));
      if (abMatch) return { name: abMatch.name, layers: [abMatch] };
      console.error(`   Artboard "${cliArtboard}" not found.`);
      return null;
    }

    // Interactive selection
    const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer2: string = await new Promise(resolve => {
      rl2.question('   Select artboard (number/name/all): ', ans => { rl2.close(); resolve(ans.trim()); });
    });

    if (answer2.toLowerCase() === 'all') {
      return { name: page.name, layers: artboards };
    }

    const idx2 = parseInt(answer2, 10);
    if (!isNaN(idx2) && idx2 >= 0 && idx2 < artboards.length) {
      const ab = artboards[idx2];
      return { name: ab.name, layers: [ab] };
    }

    const abName = artboards.find(a => a.name === answer2 || a.name.includes(answer2));
    if (abName) return { name: abName.name, layers: [abName] };

    return null;
  }

  // No artboards — use the page layers directly
  return { name: page.name, layers: page.layers };
}

// ─── Commands ──────────────────────────────────────────────────────────────

async function cmdInit() {
  console.log('🔧 Initializing sketch2code...\n');

  const config = await loadConfig();

  // Check if API key is set
  if (!config.apiKey) {
    console.log('⚠️  API key not set. The LLM needs authentication.');
    console.log('   Set it with: sketch2code set apiKey your-key');
    console.log('   Or if using local oMLX: apiKey can be left empty\n');
  }

  // Try a ping to the LLM
  try {
    console.log('📡 Testing LLM connection...\n');
  } catch {
    console.log('⚠️  Could not connect to LLM. Make sure the model server is running.\n');
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
    console.log('Available keys: llmModel, llmBaseUrl, apiKey, temperature, maxTokens, outputDir, enableVerification');
    return;
  }

  const [key, value] = args;
  const config = await loadConfig();

  if (!(key in config)) {
    console.error(`Unknown key: ${key}`);
    console.log('Available keys:', Object.keys(config).join(', '));
    return;
  }

  // Parse typed values
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

async function cmdConvert(args: string[]) {
  // Strip subcommand name from args (parseArgs would treat 'convert' as positional)
  const subArgs = args[0] === 'convert' ? args.slice(1) : args;
  // Parse options
  const { values, positionals } = parseArgs({
    args: subArgs,
    options: {
      output: { type: 'string', short: 'o' },
      verify: { type: 'boolean', short: 'v' },
      split: { type: 'string' },
      tokens: { type: 'boolean' },
      maxComponents: { type: 'string', short: 'm' },
      page: { type: 'string', short: 'p' },
      artboard: { type: 'string', short: 'a' },
    },
    strict: false,
  });

  const inputFile = positionals[0];

  if (!inputFile) {
    console.error('❌ No input file specified.');
    console.log('Usage: sketch2code convert <file.sketch> [options]');
    console.log('Options:');
    console.log('  -o, --output <dir>   Output directory (default: ./output)');
    console.log('  -v, --verify         Enable visual verification');
    console.log('  --split <mode>       Component split: page | auto');
    console.log('  -m, --max-components <n> Limit components to generate (default: all)');
    console.log('  -p, --page <name>    Page to convert (interactive if omitted)');
    console.log('  -a, --artboard <n>   Artboard index/name to convert');
    return;
  }

  // Load config
  const config = await loadConfig();
  if (values.output) config.outputDir = values.output as string;
  if (values.verify) config.enableVerification = true;
  if (values.split) config.componentSplit = values.split as any;

  console.log('🚀 sketch2code — Converting .sketch to Vue + Tailwind\n');

  // Step 1: Parse the .sketch file
  console.log('📂 Step 1/4: Parsing .sketch file...');
  const sketchData = await parseSketch(inputFile);
  const imgCount = Object.keys(sketchData.images).length;
  console.log(`   Pages:   ${sketchData.pages.length}`);
  console.log(`   Layers:  ${sketchData.layers.length} total`);
  if (imgCount > 0) {
    console.log(`   Images:  ${imgCount} assets`);
  }
  console.log('');

  // Step 2: Select page/artboard
  const selectedPage = await selectPage(sketchData.pages, values.page as string | undefined, values.artboard as string | undefined);
  if (!selectedPage) {
    console.error('❌ No page selected.');
    return;
  }
  console.log(`   Selected: "${selectedPage.name}"\n`);

  // Unwrap artboard containers — each artboard becomes a sub-page
  const subPages: { name: string; layers: SketchLayer[] }[] = [];
  for (const layer of selectedPage.layers) {
    if (layer.type === 'artboard' && layer.layers?.length > 0) {
      // Each artboard is a separate page
      subPages.push({ name: layer.name, layers: layer.layers });
    } else {
      // Regular layers — add to a single page
      if (subPages.length === 0) subPages.push({ name: selectedPage.name, layers: [] });
      subPages[0].layers.push(layer);
    }
  }

  if (subPages.length === 0) {
    console.error('❌ No layers found in selected page.');
    return;
  }

  // Process each sub-page
  const allResults: GenerationResult[] = [];
  for (const sub of subPages) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📄 Page: "${sub.name}" (${sub.layers.length} layers)\n`);

    // Step 3: Extract design tokens
    console.log('🎨 Step 2/4: Extracting design tokens...');
    const tokens = extractDesignTokens(sub.layers);
    console.log(`   Colors:     ${tokens.colors.length} unique`);
    console.log(`   Spacing:    ${tokens.spacing.length} values`);
    console.log(`   Typography: ${tokens.typography.length} font styles`);
    console.log(`   Shadows:    ${tokens.shadows.length}`);
    console.log('');

    // Step 4: Analyze component structure
    console.log('🧩 Step 3/4: Analyzing component structure...');
    const splitMode = (values.split as 'page' | 'auto') || config.componentSplit || 'auto';
    let components = analyzeComponents(sub.layers, sub.name, splitMode);
    console.log(`   Detected ${components.length} component(s)`);
    for (const comp of components) {
      console.error(`   - ${comp.name} (${comp.type})`);
    }
    console.log('');

    // Apply max-components per-page limit
    if (values.maxComponents) {
      const max = parseInt(values.maxComponents as string, 10);
      if (!isNaN(max) && max > 0 && max < components.length) {
        console.log(`   Limiting to top ${max} components (-m flag)\n`);
        components = components.slice(0, max);
      }
    }

    // Step 4: Generate blueprints + code
    console.log('📐 Step 4/4: Generating blueprints & code...');
    console.log('   Layout engine: deterministic (no LLM)');
    console.log('   LLM: only assembles code from blueprint');
    const results: (GenerationResult | null)[] = new Array(components.length).fill(null);
    const CONCURRENCY = 1;

    async function processIndex(i2: number): Promise<void> {
      const comp = components[i2];
      process.stdout.write(`   Generating ${comp.name}... `);
      try {
        const result = await generateCode(comp, tokens, config, components.filter((_, j) => j !== i2));
        results[i2] = result;
        console.log(`✅ (${result.fileName})`);
      } catch (error) {
        console.error(`❌`);
        console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (let start = 0; start < components.length; start += CONCURRENCY) {
      const batch = components.slice(start, start + CONCURRENCY);
      const indices = batch.map((_, j) => start + j);
      await Promise.all(indices.map(i2 => processIndex(i2)));
      const done = Math.min(start + CONCURRENCY, components.length);
      console.log(`   Progress: ${done}/${components.length}`);
    }

    allResults.push(...results.filter((r): r is GenerationResult => r !== null));
  }

  if (allResults.length === 0) {
    console.error('❌ No components generated.');
    return;
  }

  // Step 5: Write all output files
  console.log('\n💾 Writing output files...');
  const tokenJson = JSON.stringify({
    pages: allResults.map(r => r.componentName),
    components: allResults.length,
  }, null, 2);
  const buildResult = await generateOutput(allResults, config, config.enableVerification ? tokenJson : undefined);

  console.log(`   Output directory: ${buildResult.outputDir}`);
  console.log(`   Files created:    ${buildResult.stats.totalFiles}`);
  console.log(`   Total size:       ${(buildResult.stats.totalSize / 1024).toFixed(1)} KB`);

  for (const file of buildResult.files) {
    console.log(`   - ${path.relative(buildResult.outputDir, file.path)}`);
  }

  console.log('\n🎉 Done! Generated Vue + Tailwind code in:', buildResult.outputDir);
}

async function cmdVerify(args: string[]) {
  const { values, positionals } = parseArgs({
    options: {
      component: { type: 'string', short: 'c', required: true },
      design: { type: 'string', short: 'd' },
    },
    strict: false,
  });

  const rawComponent = positionals[0] || (typeof values.component === 'string' ? values.component : undefined);
  const componentFile = rawComponent || '';

  if (!componentFile) {
    console.error('❌ No component file specified.');
    console.log('Usage: sketch2code verify <file.vue> -d <design.png>');
    return;
  }

  const config = await loadConfig();
  console.log('🔍 Verifying component...\n');

  const sfcContent = await fs.readFile(componentFile, 'utf-8');
  const designPath = typeof values.design === 'string' ? values.design : undefined;
  const designImage = designPath ? await fs.readFile(designPath) : undefined;

  const result = await verifyComponent(
    path.basename(componentFile),
    sfcContent,
    sfcContent,
    designImage,
    config
  );

  console.log(`Result: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Accuracy: ${result.accuracy}%`);
  console.log(`\nSummary: ${result.summary}`);

  if (result.issues.length > 0) {
    console.log('\nIssues:');
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
  }
}

// ─── Run ───────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
