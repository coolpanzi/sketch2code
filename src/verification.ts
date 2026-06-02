/**
 * Visual verification module
 * Renders generated code via Playwright, screenshots, and compares pixel-by-pixel
 * with the original design export using sharp.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as sharpMod from 'sharp';
const sharp = sharpMod as any;

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  accuracy: number; // 0-100
  diffRegions?: Array<{ x: number; y: number; width: number; height: number; severity: number }>;
  summary: string;
}

/**
 * Render a Vue SFC as a screenshot using Playwright, compare with design image.
 */
export async function verifyComponent(
  componentName: string,
  sfcContent: string,
  designImage?: Buffer,
  viewport?: { width: number; height: number }
): Promise<VerificationResult> {
  const issues: string[] = [];
  let accuracy = 100;

  const tmpDir = path.join(os.tmpdir(), `sketch2code-verify-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const htmlPath = path.join(tmpDir, `${componentName}.html`);
  const screenshotPath = path.join(tmpDir, `${componentName}.png`);

  try {
    // Step 1: Build standalone HTML from SFC
    const htmlContent = buildVerificationHTML(sfcContent, viewport);
    await fs.writeFile(htmlPath, htmlContent);

    // Step 2: Render with Playwright and screenshot
    const renderedScreenshot = await renderHTMLWithPlaywright(htmlPath, screenshotPath, viewport);
    if (!renderedScreenshot) {
      issues.push('Playwright rendering returned empty screenshot');
      return failResult(issues, 'Rendering failed');
    }

    // Step 3: Compare with design image if available
    if (designImage) {
      const comparison = await pixelCompare(renderedScreenshot, designImage);
      accuracy = comparison.similarity;

      if (comparison.similarity < 70) {
        issues.push(`Low visual similarity: ${comparison.similarity}% (target > 70%)`);
      }
      if (comparison.similarity >= 90) {
        issues.push(`High fidelity: ${comparison.similarity}% match`);
      }

      if (comparison.diffRegions && comparison.diffRegions.length > 0) {
        issues.push(`${comparison.diffRegions.length} difference region(s) detected`);
      }
    }

    // Step 4: Structural checks
    const structuralChecks = checkStructure(sfcContent);
    issues.push(...structuralChecks.issues);
    accuracy -= structuralChecks.issues.length * 5;

    return {
      passed: issues.filter(i => i.startsWith('Low')).length === 0 && accuracy > 60,
      issues,
      accuracy: Math.max(0, Math.min(100, accuracy)),
      summary: issues.length === 0
        ? `Verification passed — ${accuracy}% accuracy`
        : `${issues.length} issue(s). Accuracy: ${accuracy}%`,
    };
  } catch (error) {
    return {
      passed: false,
      issues: [`Verification error: ${error instanceof Error ? error.message : String(error)}`],
      accuracy: 0,
      summary: 'Verification failed due to error.',
    };
  } finally {
    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function failResult(issues: string[], summary: string): VerificationResult {
  return { passed: false, issues, accuracy: 0, summary };
}

/**
 * Build a standalone HTML file from a Vue SFC string.
 * Inlines the CSS and renders the template as static HTML.
 */
function buildVerificationHTML(
  sfcContent: string,
  viewport?: { width: number; height: number }
): string {
  const templateMatch = sfcContent.match(/<template>([\s\S]*?)<\/template>/);
  const styleMatch = sfcContent.match(/<style[^>]*>([\s\S]*?)<\/style>/);

  const template = templateMatch ? templateMatch[1] : '';
  const style = styleMatch ? styleMatch[1] : '';
  const w = viewport?.width || 1440;
  const h = viewport?.height || 900;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    ${style}
  </style>
</head>
<body style="width:${w}px;height:${h}px;">
${template}
</body>
</html>`;
}

/**
 * Render HTML file to PNG using Playwright.
 * Falls back to returning null if Playwright is not available.
 */
async function renderHTMLWithPlaywright(
  htmlPath: string,
  outputPath: string,
  viewport?: { width: number; height: number }
): Promise<Buffer | null> {
  try {
    // Dynamic import so Playwright is optional
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });

    const page = await browser.newPage();
    await page.setViewportSize({
      width: viewport?.width || 1440,
      height: viewport?.height || 900,
    });

    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    const screenshot = await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
    await browser.close();

    return screenshot;
  } catch {
    // Playwright not installed — return null, caller handles gracefully
    return null;
  }
}

/**
 * Pixel-level comparison of two images.
 * Both are resized to 256×256 for fast comparison.
 * Returns similarity percentage and optional diff regions.
 */
async function pixelCompare(
  rendered: Buffer,
  design: Buffer
): Promise<{
  similarity: number;
  diffRegions?: Array<{ x: number; y: number; width: number; height: number; severity: number }>;
}> {
  const COMPARE_SIZE = 256;

  // Resize both to the same size
  const renderedResized = await sharp(rendered)
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const designResized = await sharp(design)
    .resize(COMPARE_SIZE, COMPARE_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const dataA = renderedResized.data;
  const dataB = designResized.data;
  const totalPixels = COMPARE_SIZE * COMPARE_SIZE;

  let matchingPixels = 0;
  const diffMap = new Float32Array(COMPARE_SIZE * COMPARE_SIZE);

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * 3; // RGB only (raw format without alpha)
    const dr = Math.abs(dataA[offset] - dataB[offset]);
    const dg = Math.abs(dataA[offset + 1] - dataB[offset + 1]);
    const db = Math.abs(dataA[offset + 2] - dataB[offset + 2]);
    const diff = (dr + dg + db) / 3;

    if (diff < 30) {
      matchingPixels++;
    }
    diffMap[i] = diff;
  }

  const similarity = Math.round((matchingPixels / totalPixels) * 100);

  // Find the top 5 different regions
  const regions = findDiffRegions(diffMap, COMPARE_SIZE, 5);

  return { similarity, diffRegions: regions };
}

/**
 * Scan the diff map for contiguous high-difference regions.
 */
function findDiffRegions(
  diffMap: Float32Array,
  size: number,
  topN: number
): Array<{ x: number; y: number; width: number; height: number; severity: number }> {
  // Simplified: divide into 8×8 blocks and rank by average diff
  const BLOCK = 32; // 8 blocks across 256px
  const blocks: Array<{ x: number; y: number; width: number; height: number; severity: number }> = [];

  for (let by = 0; by < size; by += BLOCK) {
    for (let bx = 0; bx < size; bx += BLOCK) {
      let sum = 0;
      let count = 0;
      for (let y = by; y < Math.min(by + BLOCK, size); y++) {
        for (let x = bx; x < Math.min(bx + BLOCK, size); x++) {
          sum += diffMap[y * size + x];
          count++;
        }
      }
      const avg = count > 0 ? sum / count : 0;
      if (avg > 25) { // Only regions with meaningful difference
        blocks.push({ x: bx, y: by, width: BLOCK, height: BLOCK, severity: Math.round(avg) });
      }
    }
  }

  return blocks
    .sort((a, b) => b.severity - a.severity)
    .slice(0, topN);
}

function checkStructure(sfcContent: string): { issues: string[] } {
  const issues: string[] = [];

  const hasHeader = /<header[\s>]/i.test(sfcContent);
  const hasNav = /<nav[\s>]/i.test(sfcContent);
  const hasMain = /<main[\s>]/i.test(sfcContent);
  const hasFooter = /<footer[\s>]/i.test(sfcContent);

  if (hasHeader && !hasNav) issues.push('Has header but no nav element');
  if (hasFooter && !hasMain) issues.push('Has footer but no main content area');

  const images = sfcContent.match(/<img[^>]*>/g) || [];
  for (const img of images) {
    if (!/alt=["']/i.test(img)) {
      issues.push('Image missing alt attribute');
    }
  }

  const buttons = sfcContent.match(/<button[^>]*>/g) || [];
  for (const btn of buttons) {
    if (!/type=["'](?:button|submit|reset)["']/i.test(btn)) {
      issues.push('Button without explicit type attribute');
    }
  }

  return { issues };
}

/**
 * Generate a thumbnail of the design for quick visual comparison
 */
export async function generateThumbnail(
  image: Buffer,
  outputPath: string,
  width: number = 480
): Promise<string> {
  await sharp(image)
    .resize(width, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(outputPath);

  return outputPath;
}
