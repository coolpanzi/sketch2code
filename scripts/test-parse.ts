import { parseSketch } from '../src/sketch-parser';

async function main() {
  const result = await parseSketch('/Users/coolpanzi/Downloads/0625企康看版.sketch');
  console.log('✅ Pages:', result.pages.length);
  for (const p of result.pages) {
    const w = p.width;
    const h = p.height;
    console.log('  PAGE', p.name, '(' + w + 'x' + h + ')', 'layers:', p.layers.length);
    for (const l of p.layers) {
      const lw = l.width;
      const lh = l.height;
      const subtype = l.layers.length > 0 ? ' (children:' + l.layers.length + ')' : '';
      console.log('    [' + l.type + ']', l.name, '(' + lw + 'x' + lh + ')' + subtype);
      if (l.font) {
        console.log('      text:', l.font.name, l.font.size + 'px', l.font.weight);
      }
    }
  }
  console.log('✅ Total layers:', result.layers.length);
  console.log('✅ Fonts:', result.assets.fonts);
  console.log('✅ Colors count:', result.assets.colors.size);
  console.log('✅ Colors (first 10):', Array.from(result.assets.colors).slice(0, 10));
  console.log('✅ Sizes (first 10):', result.assets.sizes.slice(0, 10));
}

main().catch(console.error);
