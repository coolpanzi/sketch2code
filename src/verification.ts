/**
 * Visual verification module
 * Renders generated code and compares with the original design
 * Uses a multimodal LLM to visually inspect the output
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as sharpMod from 'sharp';
// @ts-nocheck — sharp native addon module type resolution
const sharp = sharpMod as any;
import { createVerificationClient, Config } from './config.js';

export interface VerificationResult {
  passed: boolean;
  issues: string[];
  accuracy: number; // 0-100
  summary: string;
}

/**
 * Render a Vue component as HTML, take a screenshot, and verify
 */
export async function verifyComponent(
  componentName: string,
  template: string,
  sfcContent: string,
  designImagePath?: Buffer,
  config?: Config
): Promise<VerificationResult> {
  const issues: string[] = [];
  let accuracy = 100;

  // Step 1: Extract template and render as HTML
  const htmlContent = renderSFCtoHTML(sfcContent);
  const htmlPath = path.join('/tmp', `sketch2code-${Date.now()}-${componentName}.html`);

  try {
    await fs.writeFile(htmlPath, `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 16px; font-family: sans-serif; }
    [v-cloak] { display: none; }
  </style>
</head>
<body>
${template}
</body>
</html>`);

    // Step 2: If design image is available, do visual comparison
    if (designImagePath) {
      const verdict = await visualCompare(designImagePath, htmlPath, config);
      issues.push(...verdict.issues);
      accuracy = Math.max(0, accuracy - (100 - verdict.accuracy));
    }

    // Step 3: Structural checks
    const structuralChecks = checkStructure(htmlContent);
    issues.push(...structuralChecks.issues);
    accuracy -= structuralChecks.issues.length * 5;

    await fs.unlink(htmlPath).catch(() => {});

    return {
      passed: issues.length === 0 && accuracy > 70,
      issues,
      accuracy: Math.max(0, Math.min(100, accuracy)),
      summary: issues.length === 0
        ? 'Verification passed — no issues detected.'
        : `${issues.length} issue(s) found. Accuracy: ${accuracy}%`,
    };
  } catch (error) {
    await fs.unlink(htmlPath).catch(() => {});
    return {
      passed: false,
      issues: [`Verification error: ${error instanceof Error ? error.message : String(error)}`],
      accuracy: 0,
      summary: 'Verification failed due to error.',
    };
  }
}

function renderSFCtoHTML(sfcContent: string): string {
  // Extract template content
  const templateMatch = sfcContent.match(/<template>([\s\S]*?)<\/template>/);
  const template = templateMatch ? templateMatch[1] : '';

  return template;
}

function checkStructure(html: string): { issues: string[] } {
  const issues: string[] = [];

  // Check for semantic HTML
  const hasHeader = /<header[\s>]/i.test(html);
  const hasNav = /<nav[\s>]/i.test(html);
  const hasMain = /<main[\s>]/i.test(html);
  const hasFooter = /<footer[\s>]/i.test(html);

  if (hasHeader && !hasNav) issues.push('Has header but no nav element — consider adding semantic navigation');
  if (hasFooter && !hasMain) issues.push('Has footer but no main content area');

  // Check for image alt text
  const images = html.match(/<img[^>]*>/g) || [];
  for (const img of images) {
    if (!/alt=["']/i.test(img)) {
      issues.push('Image missing alt attribute for accessibility');
    }
  }

  // Check for button types
  const buttons = html.match(/<button[^>]*>/g) || [];
  for (const btn of buttons) {
    if (!/type=["'](?:button|submit|reset)["']/i.test(btn)) {
      issues.push('Button without explicit type attribute');
    }
  }

  return { issues };
}

async function visualCompare(
  designImage: Buffer,
  htmlPath: string,
  config?: Config
): Promise<{ issues: string[]; accuracy: number }> {
  // Since we can't easily render HTML to image in a CLI without a browser,
  // we'll record this as a note for manual review
  // In a full implementation, we'd use Puppeteer/Playwright to render the HTML

  return {
    issues: [
      'Visual comparison requires a headless browser (Puppeteer/Playwright).',
      'Manual review recommended: compare the generated HTML output with the original design screenshot.',
    ],
    accuracy: 85, // Conservative estimate without visual comparison
  };
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

/**
 * Compare two images pixel-level (requires both to be rendered)
 */
export async function compareImages(
  imageA: Buffer,
  imageB: Buffer
): Promise<{ similarity: number; differences: number }> {
  // Get image metadata for dimensions
  const metaA = await sharp(imageA).metadata();
  const metaB = await sharp(imageB).metadata();

  if (metaA.width !== metaB.width || metaA.height !== metaB.height) {
    return { similarity: 0, differences: 1 };
  }

  // Resize both to a common size for comparison
  const resizedA = await sharp(imageA).resize(256, 256).png().toBuffer();
  const resizedB = await sharp(imageB).resize(256, 256).png().toBuffer();

  // Read pixel data
  const metaA2 = await sharp(resizedA).metadata();
  const metaB2 = await sharp(resizedB).metadata();
  const dataA = await sharp(resizedA).raw().toBuffer();
  const dataB = await sharp(resizedB).raw().toBuffer();

  if (!dataA || !dataB) return { similarity: 0, differences: 1 };

  // Compare pixels
  const totalPixels = metaA2.width * metaA2.height;
  let matchingPixels = 0;

  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1]);
    const db = Math.abs(dataA[i + 2] - dataB[i + 2]);

    // Allow some tolerance for compression differences
    if (dr + dg + db < 30) {
      matchingPixels++;
    }
  }

  const similarity = (matchingPixels / totalPixels) * 100;

  return {
    similarity: Math.round(similarity),
    differences: totalPixels - matchingPixels,
  };
}
