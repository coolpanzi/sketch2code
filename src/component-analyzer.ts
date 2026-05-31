/**
 * Component analyzer
 * Analyzes the layer structure and splits into components
 */

import { SketchLayer } from './sketch-parser.js';

export interface ComponentSpec {
  name: string;
  type: 'page' | 'component' | 'region';
  description: string;
  layers: SketchLayer[];
  children: ComponentSpec[];
  tokens: {
    colors: string[];
    typography: string[];
    spacing: number[];
    shadows: string[];
  };
  props?: Record<string, any>;
  states?: string[];
  responsive?: boolean;
}

/**
 * Analyze layer structure and generate component specifications
 * @param splitMode 'auto' = detect sub-components, 'page' = one big page component
 */
const REGION_KEYWORDS: { re: RegExp; region: string }[] = [
  { re: /(?:导航|nav|navbar|tab|页签|顶部|header)/i, region: 'header' },
  { re: /(?:侧边|sidebar|aside|菜单|menu)/i, region: 'sidebar' },
  { re: /(?:内容|content|main|区域)/i, region: 'main' },
  { re: /(?:表格|table|数据)/i, region: 'table' },
  { re: /(?:指标|card|卡片|kpi)/i, region: 'cards' },
  { re: /(?:图表|chart|可视化|柱状|bar)/i, region: 'chart' },
  { re: /(?:分页|pagination|footer|页脚)/i, region: 'footer' },
];

function detectPageStructure(layers: SketchLayer[]): Record<string, any> {
  const regions: Record<string, any[]> = {};
  
  // Detect sidebar: narrow (width < 20% of widest), tall group positioned at left edge
  const maxW = Math.max(...layers.filter(l => l.width > 0).map(l => l.width + l.x), 0);
  
  for (const layer of layers) {
    const name = layer.name || '';
    // Check if this layer matches a known region
    for (const kw of REGION_KEYWORDS) {
      if (kw.re.test(name)) {
        (regions[kw.region] = regions[kw.region] || []).push(layer);
        break;
      }
    }
  }
  
  // Heuristic: if something is narrow (< 20% width) and tall, it's a sidebar
  if (maxW > 0) {
    for (const layer of layers) {
      if (layer.width > 0 && layer.width / maxW < 0.2 && layer.height > maxW * 0.3) {
        (regions['sidebar'] = regions['sidebar'] || []).push(layer);
      }
    }
  }
  
  return {
    layout: 'sidebar-main',
    regions,
  };
}

export function analyzeComponents(
  layers: SketchLayer[],
  pageName: string = 'Page',
  splitMode: 'page' | 'auto' = 'auto'
): ComponentSpec[] {
  if (splitMode === 'page') {
    // Detect page structure (sidebar, main, header, etc.)
    const structure = detectPageStructure(layers);
    
    return [{
      name: pageName,
      type: 'page',
      description: 'Full page layout: ' + pageName,
      layers,
      children: [],
      tokens: collectAllTokens(layers),
      responsive: true,
      props: { ...extractPageProps(layers), structure },
    }];
  }

  const components: ComponentSpec[] = [];
  for (const layer of layers) {
    const spec = analyzeLayerAsComponent(layer);
    if (spec) components.push(spec);
  }

  if (components.length === 0 && layers.length > 0) {
    components.push({
      name: pageName,
      type: 'page',
      description: 'Full page layout: ' + pageName,
      layers,
      children: [],
      tokens: { colors: [], typography: [], spacing: [], shadows: [] },
      responsive: true,
    });
  }

  return components;
}

/** Collect tokens from all descendant layers recursively */
function collectAllTokens(layers: SketchLayer[]): ComponentSpec['tokens'] {
  const colors = new Set<string>();
  const typography = new Set<string>();
  const spacing = new Set<number>();
  const shadows = new Set<string>();

  function walk(ls: SketchLayer[]): void {
    for (const l of ls) {
      for (const f of l.fills) if (f.color) colors.add(f.color.toUpperCase());
      for (const s of l.strokes) if (s.color) colors.add(s.color.toUpperCase());
      if (l.font) typography.add(l.font.name + '-' + l.font.size);
      if (l.width > 0) spacing.add(l.width);
      if (l.height > 0) spacing.add(l.height);
      for (const s of l.shadows) shadows.add(s.blurRadius + 'px blur');
      if (l.layers?.length) walk(l.layers);
    }
  }
  walk(layers);

  return {
    colors: Array.from(colors),
    typography: Array.from(typography),
    spacing: Array.from(spacing).sort((a, b) => a - b),
    shadows: Array.from(shadows),
  };
}

function extractPageProps(layers: SketchLayer[]): Record<string, any> {
  const texts: string[] = [];
  function walk(ls: SketchLayer[]): void {
    for (const l of ls) {
      if (l.type === 'text' && l.textContent) texts.push(l.textContent);
      if (l.layers?.length) walk(l.layers);
    }
  }
  walk(layers);
  return { textContent: texts.slice(0, 20) };
}

function analyzeLayerAsComponent(layer: SketchLayer): ComponentSpec | null {
  // Symbol/component instances are always separate components
  if (layer.type === 'component' || layer.type === 'componentOverlay' || layer.type === 'symbolInstance') {
    return {
      name: sanitizeComponentName(layer.name),
      type: 'component',
      description: 'Symbol/Component: ' + layer.name,
      layers: [layer],
      children: [],
      tokens: extractTokens(layer),
      props: extractProps(layer),
    };
  }

  // Named frames suggest component boundaries
  const componentNames = [
    'header', 'navbar', 'nav', 'navigation',
    'footer', 'hero', 'banner', 'carousel', 'slider',
    'sidebar', 'menu', 'dropdown',
    'card', 'tile', 'panel', 'section',
    'form', 'input', 'button', 'cta',
    'table', 'list', 'grid',
    'modal', 'dialog', 'overlay',
    'tab', 'accordion',
    'breadcrumb', 'pagination',
  ];

  const nameLower = layer.name.toLowerCase();
  const isComponentBoundary = componentNames.some(n => nameLower.includes(n));

  if (isComponentBoundary && layer.layers.length > 0) {
    return {
      name: sanitizeComponentName(layer.name),
      type: 'region',
      description: 'Section: ' + layer.name,
      layers: [layer],
      children: [],
      tokens: extractTokens(layer),
      props: extractProps(layer),
      responsive: shouldBeResponsive(layer),
    };
  }

  // Deep analyze children for sub-components
  if (layer.layers.length > 0) {
    const childComponents = layer.layers
      .map(child => analyzeLayerAsComponent(child))
      .filter((c): c is ComponentSpec => c !== null);

    if (childComponents.length > 0) {
      return {
        name: sanitizeComponentName(layer.name || 'container'),
        type: childComponents.length === 1 ? 'component' : 'region',
        description: 'Container: ' + layer.name + ' (' + childComponents.length + ' children)',
        layers: [layer],
        children: childComponents,
        tokens: extractTokens(layer),
        props: {},
      };
    }
  }

  return null;
}

function sanitizeComponentName(name: string): string {
  return name
    .replace(/[-_\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/^[^a-zA-Z]/, 'C')
    .slice(0, 30)
    .replace(/^(.{16})..+$/, '$1...') + 'Section';
}

function extractTokens(layer: SketchLayer): ComponentSpec['tokens'] {
  const colors: string[] = [];
  const typography: string[] = [];
  const spacing: number[] = [];
  const shadows: string[] = [];

  // Colors from fills and strokes (already hex strings in new format)
  for (const fill of layer.fills) {
    if (fill.color) colors.push(fill.color.toUpperCase());
  }
  for (const stroke of layer.strokes) {
    if (stroke.color) colors.push(stroke.color.toUpperCase());
  }

  // Typography
  if (layer.font) {
    typography.push(layer.font.name + '-' + layer.font.size);
  }

  // Spacing from layer size
  if (layer.width > 0) spacing.push(layer.width);
  if (layer.height > 0) spacing.push(layer.height);

  // Shadows
  for (const s of layer.shadows) {
    shadows.push(s.blurRadius + 'px blur');
  }

  return {
    colors: Array.from(new Set(colors)),
    typography,
    spacing: Array.from(new Set(spacing)).sort((a, b) => a - b),
    shadows,
  };
}

function extractProps(layer: SketchLayer): Record<string, any> {
  const props: Record<string, any> = {};

  if (layer.type === 'text' && layer.textContent) {
    props.content = layer.textContent;
  }

  if (layer.type === 'image') {
    props.isImage = true;
  }

  if (layer.type === 'text' && layer.font) {
    props.fontSize = layer.font.size;
    props.fontFamily = layer.font.name;
  }

  return props;
}

function shouldBeResponsive(layer: SketchLayer): boolean {
  if (layer.width > 800 && layer.height < 100) return true;
  if (layer.type === 'component' || layer.type === 'componentOverlay' || layer.type === 'symbolInstance') return true;
  return false;
}
