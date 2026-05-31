/**
 * Render artboard layers to PNG using sharp.
 * Draws rectangles for shapes and SVG-like text for text layers.
 */

import { ContentItem } from './region-detector.js';
import { SketchLayer } from './sketch-parser.js';

// TS sharp import workaround
async function getSharp() {
  const m = await import('sharp');
  return (m as any).default || m;
}

export async function renderArtboardToPng(
  layers: SketchLayer[],
  pageName: string,
  outputPath: string
): Promise<Buffer> {
  const sharp = await getSharp();
  
  // Collect all content items with absolute positions
  const items = collectAllContent(layers);
  
  // Determine page bounds from top-level layers
  const pageW = Math.max(...layers.map(l => l.x + l.width), 1280);
  const pageH = Math.max(...layers.map(l => l.y + l.height), 800);
  
  // Build SVG first (sharp can render SVG to PNG)
  const svgLines: string[] = [];
  svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageW} ${pageH}" width="${pageW}" height="${pageH}">`);
  svgLines.push(`<rect width="${pageW}" height="${pageH}" fill="#f5f5f5"/>`);
  
  // Sort by y then x for z-order
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  
  for (const item of sorted) {
    const x = item.x;
    const y = item.y;
    const w = Math.max(item.w, 1);
    const h = Math.max(item.h, 1);
    
    if (item.text) {
      const fontSize = item.fontSize || 12;
      const fill = item.color || '#333333';
      const fontWeight = item.fontWeight === 'bold' ? 'bold' : 'normal';
      
      // Background for text (if has bgColor)
      if (item.bgColor) {
        svgLines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${item.bgColor}" rx="${item.cornerRadius || 0}"/>`);
      }
      
      svgLines.push(`<text x="${x}" y="${y + fontSize}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${fill}">${escapeXml(item.text)}</text>`);
    } else if (item.bgColor || item.hasBorder) {
      const fill = item.bgColor || 'none';
      const stroke = item.hasBorder ? (item.borderColor || '#ddd') : 'none';
      const rx = item.cornerRadius || 0;
      svgLines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${item.hasBorder ? 1 : 0}" rx="${rx}"/>`);
    }
  }
  
  svgLines.push('</svg>');
  const svg = svgLines.join('\n');
  
  // Render SVG to PNG
  const pngBuf = await sharp(Buffer.from(svg)).png().toBuffer();
  
  // Save to file if outputPath provided
  if (outputPath) {
    const fs = await import('fs/promises');
    await fs.writeFile(outputPath, pngBuf);
  }
  
  return pngBuf;
}

function collectAllContent(layers: SketchLayer[]): ContentItem[] {
  const items: ContentItem[] = [];
  
  function walk(ls: SketchLayer[], offsetX = 0, offsetY = 0): void {
    for (const l of ls) {
      if (!l.visible) continue;
      const absX = offsetX + l.x;
      const absY = offsetY + l.y;
      
      if (l.textContent?.trim()) {
        items.push({
          text: l.textContent.trim(),
          x: absX, y: absY,
          w: l.width, h: l.height,
          fontSize: l.font?.size || 12,
          fontWeight: l.font?.weight || 'normal',
          color: l.font?.color || '',
          bgColor: l.fills.find(f => f.isEnabled)?.color || '',
          layerName: l.name,
          layerType: l.type,
          cornerRadius: l.cornerRadius,
          hasBorder: l.strokes.some(s => s.isEnabled),
          borderColor: l.strokes.find(s => s.isEnabled)?.color || '',
        });
      } else if (l.type === 'shape') {
        const fill = l.fills.find(f => f.isEnabled);
        const stroke = l.strokes.find(s => s.isEnabled);
        if (fill || stroke) {
          items.push({
            text: '', x: absX, y: absY,
            w: l.width, h: l.height,
            fontSize: 0, fontWeight: '', color: '',
            bgColor: fill?.color || '',
            layerName: l.name, layerType: l.type,
            cornerRadius: l.cornerRadius,
            hasBorder: !!stroke,
            borderColor: stroke?.color || '',
          });
        }
      }
      
      if (l.layers?.length) walk(l.layers, absX, absY);
    }
  }
  
  walk(layers);
  return items;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
