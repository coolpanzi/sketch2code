/**
 * Phase 1: Property-to-CSS Engine
 * Converts Sketch layer properties directly to CSS properties (pixel-perfect, no LLM)
 */

import type {
  Layer,
  BaseLayer,
  TextLayer,
  ShapeLayer,
  ImageLayer,
  GroupLayer,
  ArtboardLayer,
  ComponentLayer,
  SymbolLayer,
  FillStyle,
  GradientInfo,
  ShadowStyle,
  BorderStyle,
  CSSPropertiesMap,
  PropertyToCSSResult,
  BEMName,
  BlendMode,
} from '../types.js';
import { LayerType } from '../types.js';

// ─── BEM Class Name Generator ──────────────────────────────────────────────

/**
 * Generates BEM-style CSS class names from layer names.
 */
export class BEMGenerator {
  /**
   * Chinese character to pinyin-like abbreviation map for common UI terms.
   */
  private static readonly CHINESE_MAP: Record<string, string> = {
    '导航': 'nav',
    '导航栏': 'navbar',
    '菜单': 'menu',
    '按钮': 'btn',
    '按钮组': 'btn-group',
    '输入框': 'input',
    '表单': 'form',
    '卡片': 'card',
    '列表': 'list',
    '表格': 'table',
    '标题': 'title',
    '副标题': 'subtitle',
    '头部': 'header',
    '头部导航': 'header-nav',
    '底部': 'footer',
    '页脚': 'footer',
    '侧边栏': 'sidebar',
    '侧栏': 'sidebar',
    '内容': 'content',
    '正文': 'body',
    '主体': 'main',
    '主要': 'main',
    '背景': 'bg',
    '遮罩': 'overlay',
    '弹窗': 'modal',
    '对话框': 'dialog',
    '提示': 'toast',
    '警告': 'alert',
    '图标': 'icon',
    '图片': 'img',
    '图像': 'img',
    '头像': 'avatar',
    '标签': 'tag',
    '徽章': 'badge',
    '分隔线': 'divider',
    '进度条': 'progress',
    '滑块': 'slider',
    '开关': 'switch',
    '复选框': 'checkbox',
    '单选框': 'radio',
    '下拉': 'dropdown',
    '搜索': 'search',
    '搜索框': 'search-input',
    '面包屑': 'breadcrumb',
    '轮播': 'carousel',
    '标签页': 'tabs',
    '折叠': 'accordion',
    '工具栏': 'toolbar',
    '面板': 'panel',
    '容器': 'container',
    '包装': 'wrapper',
    '包裹': 'wrapper',
    '区域': 'section',
    '块': 'block',
    '行': 'row',
    '列': 'col',
    '网格': 'grid',
    '布局': 'layout',
    '间距': 'spacer',
    '文字': 'text',
    '描述': 'desc',
    '说明': 'desc',
    '注释': 'note',
    '链接': 'link',
    '超链接': 'link',
    '横幅': 'banner',
    '广告': 'ad',
    '通知': 'notification',
    '消息': 'message',
    '加载': 'loading',
    '空状态': 'empty',
    '错误': 'error',
    '成功': 'success',
    '跳过': 'skip',
    '关闭': 'close',
    '展开': 'expand',
    '收起': 'collapse',
    '选中': 'active',
    '激活': 'active',
    '禁用': 'disabled',
    '悬停': 'hover',
    '焦点': 'focus',
    '前': 'prev',
    '后': 'next',
    '上': 'top',
    '下': 'bottom',
    '左': 'left',
    '右': 'right',
    '中': 'center',
    '内': 'inner',
    '外': 'outer',
    '首页': 'home',
    '关于': 'about',
    '联系': 'contact',
    '登录': 'login',
    '注册': 'signup',
    '用户': 'user',
    '密码': 'password',
    '邮箱': 'email',
    '电话': 'phone',
    '地址': 'address',
    '名称': 'name',
    '价格': 'price',
    '数量': 'quantity',
    '总计': 'total',
    '小计': 'subtotal',
    '折扣': 'discount',
    '优惠券': 'coupon',
    '购物车': 'cart',
    '订单': 'order',
    '商品': 'product',
    '商品列表': 'product-list',
    '分类': 'category',
    '筛选': 'filter',
    '排序': 'sort',
    '分页': 'pagination',
    '品牌': 'brand',
    'Logo': 'logo',
    '标志': 'logo',
    '公司': 'company',
    '版权': 'copyright',
    '条款': 'terms',
    '隐私': 'privacy',
    '帮助': 'help',
    '设置': 'settings',
    '个人中心': 'profile',
    '个人资料': 'profile',
    '编辑': 'edit',
    '删除': 'delete',
    '保存': 'save',
    '取消': 'cancel',
    '确认': 'confirm',
    '提交': 'submit',
    '重置': 'reset',
    '返回': 'back',
    '下载': 'download',
    '上传': 'upload',
    '分享': 'share',
    '点赞': 'like',
    '收藏': 'favorite',
    '评论': 'comment',
    '回复': 'reply',
    '发送': 'send',
    '更多': 'more',
    '查看全部': 'view-all',
    '查看更多': 'view-more',
    '日历': 'calendar',
    '时间': 'time',
    '日期': 'date',
    '年份': 'year',
    '月份': 'month',
    '星期': 'week',
    '星期一': 'mon',
    '星期二': 'tue',
    '星期三': 'wed',
    '星期四': 'thu',
    '星期五': 'fri',
    '星期六': 'sat',
    '星期日': 'sun',
    '编组': 'group',
    '矩形': 'rect',
    '椭圆': 'oval',
    '圆形': 'circle',
    '三角形': 'triangle',
    '星形': 'star',
    '路径': 'path',
    '文本': 'text',
    '图片': 'img',
    '位图': 'bitmap',
    '符号': 'symbol',
    '组件': 'comp',
    '画板': 'artboard',
    '蒙版': 'mask',
    '占位': 'placeholder',
    '线条': 'line',
    '箭头': 'arrow',
    '聊天': 'chat',
    '频道': 'channel',
    '房间': 'room',
    '成员': 'member',
    '角色': 'role',
    '权限': 'permission',
    '新建': 'create',
    '添加': 'add',
    '移除': 'remove',
    '导入': 'import',
    '导出': 'export',
    '打印': 'print',
    '复制': 'copy',
    '粘贴': 'paste',
    '剪切': 'cut',
    '撤销': 'undo',
    '重做': 'redo',
    '刷新': 'refresh',
    '同步': 'sync',
  };

  /**
   * Converts a Chinese/English layer name to a safe CSS class name.
   * E.g. "导航栏" -> "nav-bar", "卡片背景" -> "card-bg", "myButton" -> "my-button"
   */
  static toClassName(name: string): string {
    if (!name || name.trim() === '') {
      return 'unnamed';
    }

    let result = name.trim();

    // Try to replace known Chinese multi-char words first (longest match first)
    // Insert a hyphen between adjacent Chinese-word replacements to avoid merging
    const sortedKeys = Object.keys(BEMGenerator.CHINESE_MAP).sort(
      (a, b) => b.length - a.length
    );
    for (const cn of sortedKeys) {
      result = result.split(cn).join(`\x00${BEMGenerator.CHINESE_MAP[cn]}\x00`);
    }

    // Replace any remaining Chinese characters with hyphenated ascii placeholder
    result = result.replace(/[一-鿿]/g, '-');

    // Convert null markers to hyphens, then collapse
    result = result.replace(/\x00/g, '-');

    // Handle camelCase / PascalCase -> kebab-case
    result = result.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
    result = result.replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');

    // Lowercase the entire string for consistent class names
    result = result.toLowerCase();

    // Replace non-alphanumeric (except hyphens) with hyphens
    result = result.replace(/[^a-z0-9-]/g, '-');

    // Collapse multiple hyphens
    result = result.replace(/-+/g, '-');

    // Trim hyphens from start/end
    result = result.replace(/^-+|-+$/g, '');

    // Ensure it doesn't start with a digit
    if (/^\d/.test(result)) {
      result = 'layer-' + result;
    }

    return result || 'unnamed';
  }

  /**
   * Creates a BEM-style class name.
   * E.g. create('card', 'title', 'active') -> { block:'card', element:'title', modifier:'active', full:'card__title--active' }
   */
  static create(
    block: string,
    element?: string,
    modifier?: string
  ): BEMName {
    const parts: string[] = [block];
    if (element) {
      parts.push('__' + element);
    }
    if (modifier) {
      parts.push('--' + modifier);
    }
    return {
      block,
      element,
      modifier,
      full: parts.join(''),
    };
  }
}

// ─── Color Conversion Utilities ─────────────────────────────────────────────

/**
 * Converts a color value to a CSS string.
 * Handles both raw Sketch color objects {red, green, blue, alpha} (0-1 range)
 * and already-parsed hex strings like "#3B82F6".
 */
export function sketchColorToCSS(color: any): string {
  if (!color) {
    return 'transparent';
  }

  // Already a hex string (from the parser)
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      return color;
    }
    // Try to parse as a color name or other format
    return color;
  }

  // Raw Sketch color object with {red, green, blue, alpha} in 0-1 range
  if (
    typeof color === 'object' &&
    'red' in color &&
    'green' in color &&
    'blue' in color
  ) {
    const r = Math.round((color.red ?? 0) * 255);
    const g = Math.round((color.green ?? 0) * 255);
    const b = Math.round((color.blue ?? 0) * 255);
    const a = color.alpha ?? 1;

    if (a < 0.005) {
      return 'transparent';
    }

    // If fully opaque, return hex for cleaner output
    if (a >= 0.995) {
      const hex =
        '#' +
        [r, g, b]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase();
      return hex;
    }

    // Otherwise return rgba
    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(4)})`;
  }

  return 'transparent';
}

/**
 * Pass-through for hex strings, with validation.
 */
export function hexToCSS(hex: string): string {
  if (!hex || !hex.startsWith('#')) {
    return hex || 'transparent';
  }
  return hex;
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Converts a BlendMode enum value to its CSS mix-blend-mode string.
 */
function blendModeToCSS(blendMode: BlendMode): string {
  // The BlendMode enum values are already the CSS-compatible strings
  return String(blendMode);
}

/**
 * Converts gradient info to a CSS gradient string.
 */
function gradientToCSS(gradient: GradientInfo, opacity: number): string {
  const stops = gradient.stops
    .map((stop) => {
      const color = stop.color || '#000000';
      const pos = Math.round(stop.position * 100);
      // Apply fill opacity to each stop's color if needed
      if (opacity < 0.995) {
        // Parse hex to rgba with opacity
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(4)}) ${pos}%`;
      }
      return `${color} ${pos}%`;
    })
    .join(', ');

  if (gradient.type === 'linear') {
    // Calculate angle from gradient.from and gradient.to points
    const dx = gradient.to.x - gradient.from.x;
    const dy = gradient.to.y - gradient.from.y;
    const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    // CSS angle: 0deg = bottom to top, 90deg = left to right
    const cssAngle = 90 - angle;
    return `linear-gradient(${cssAngle}deg, ${stops})`;
  } else if (gradient.type === 'radial') {
    return `radial-gradient(circle, ${stops})`;
  } else {
    // Angular (conic) - Sketch angular gradients are conic in CSS
    const dx = gradient.to.x - gradient.from.x;
    const dy = gradient.to.y - gradient.from.y;
    const angle = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
    return `conic-gradient(from ${angle}deg, ${stops})`;
  }
}

/**
 * Converts a shadow style to a CSS box-shadow string.
 */
function shadowToCSS(shadow: ShadowStyle): string {
  if (!shadow.isEnabled) {
    return '';
  }

  const inset = shadow.isInner ? 'inset ' : '';
  const offsetX = Math.round(shadow.offsetX);
  const offsetY = Math.round(shadow.offsetY);
  const blur = Math.round(shadow.blurRadius);
  const spread = Math.round(shadow.spread);

  // Shadow color - Sketch shadows typically have full opacity in the color field,
  // with the alpha channel representing the actual opacity
  const color = shadow.color || '#000000';
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  return `${inset}${offsetX}px ${offsetY}px ${blur}px ${spread}px rgba(${r}, ${g}, ${b}, 1)`;
}

// ─── PropertyToCSS Main Class ─────────────────────────────────────────────

/**
 * Converts Sketch layer properties directly to CSS properties.
 * This is the Phase 1 (algorithm-only) step of the layered restoration engine.
 */
export class PropertyToCSS {
  private cssMap: CSSPropertiesMap = {};
  private layerClassMap: Map<string, string> = new Map();
  private classNameCounter: number = 0;
  private usedClassNames: Set<string> = new Set();

  /**
   * Main entry point: converts all layers in an artboard to CSS.
   */
  convert(artboard: Layer): PropertyToCSSResult {
    this.cssMap = {};
    this.layerClassMap = new Map();
    this.classNameCounter = 0;
    this.usedClassNames = new Set();

    // Process the artboard itself (root)
    // Sketch stores child coordinates relative to parent, so children use their coords as-is
    const rootName = 'root';
    this.usedClassNames.add(rootName);
    this.layerClassMap.set(artboard.id, rootName);
    const rootProps: Record<string, string> = {};
    rootProps['position'] = 'relative';
    rootProps['width'] = `${Math.round(artboard.rect.width)}px`;
    rootProps['height'] = `${Math.round(artboard.rect.height)}px`;
    if (artboard.type === LayerType.ARTBOARD && (artboard as ArtboardLayer).backgroundColor) {
      rootProps['background-color'] = hexToCSS((artboard as ArtboardLayer).backgroundColor!);
    }
    this.cssMap[rootName] = rootProps;

    // Process children with flat naming
    if ('layers' in artboard && Array.isArray((artboard as any).layers)) {
      for (const child of (artboard as any).layers) {
        this.processLayer(child);
      }
    }

    return {
      cssMap: this.cssMap,
      layerClassMap: this.layerClassMap,
    };
  }

  /**
   * Recursively processes a layer and its children.
   * Uses FLAT naming: no BEM path nesting.
   */
  private processLayer(layer: Layer): void {
    // Skip invisible layers (but still process group children)
    if (!layer.visible && layer.type !== LayerType.GROUP && layer.type !== LayerType.ARTBOARD && layer.type !== LayerType.COMPONENT) {
      return;
    }

    const className = this.generateFlatClassName(layer);
    this.layerClassMap.set(layer.id, className);

    const props: Record<string, string> = {};

    // Base properties for ALL layers
    this.applyBaseProperties(layer, props);

    // Type-specific properties
    switch (layer.type) {
      case LayerType.TEXT:
        this.applyTextProperties(layer as TextLayer, props);
        break;
      case LayerType.SHAPE:
        this.applyShapeProperties(layer as ShapeLayer, props);
        break;
      case LayerType.IMAGE:
        this.applyImageProperties(props);
        break;
      case LayerType.GROUP:
      case LayerType.ARTBOARD:
      case LayerType.COMPONENT:
        this.applyContainerProperties(layer as GroupLayer | ArtboardLayer | ComponentLayer, props);
        break;
      case LayerType.SYMBOL:
        break;
    }

    this.cssMap[className] = props;

    // Recurse into children
    if ('layers' in layer && Array.isArray((layer as any).layers)) {
      for (const child of (layer as any).layers) {
        this.processLayer(child);
      }
    }
  }

  /**
   * Generates a short, flat, unique CSS class name.
   * Uses layer name, type, and visual hints to create meaningful names.
   */
  private generateFlatClassName(layer: Layer): string {
    // Step 1: Get the most descriptive part of the layer name
    // Sketch names look like "3.数据输入/6.下拉选择框/2.小/4.不可用"
    // Strategy: find the segment with the most Chinese/alphabetic characters
    let rawName = layer.name || '';
    if (rawName.includes('/')) {
      const segments = rawName.split('/');
      // Try each segment from the end, pick the one with most meaningful chars
      let bestSegment = '';
      let bestScore = 0;
      for (const seg of segments) {
        // Strip leading numbers like "3." or "6."
        const cleaned = seg.replace(/^\d+[\.\s]*/, '').trim();
        // Score: count Chinese + alphabetic characters
        const score = (cleaned.match(/[一-鿿a-zA-Z]/g) || []).length;
        if (score > bestScore) {
          bestScore = score;
          bestSegment = cleaned;
        }
      }
      rawName = bestSegment || segments[segments.length - 1];
    } else {
      // Strip leading numbers
      rawName = rawName.replace(/^\d+[\.\s]*/, '');
    }

    let baseName = BEMGenerator.toClassName(rawName);

    // Step 2: Clean up Sketch version prefixes like "3.0", "2-1-0", "1."
    baseName = baseName
      .replace(/^\d+-/, '')
      .replace(/^\d+\./g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Step 3: If name is still generic, use type + visual hints
    if (!baseName || baseName.length < 2 || /^\d+$/.test(baseName) ||
        /^(unnamed|group|rect|layer|e\d+)$/i.test(baseName)) {
      baseName = this.inferClassName(layer);
    }

    // Step 4: Truncate to max 20 chars
    if (baseName.length > 20) {
      baseName = baseName.substring(0, 20).replace(/-+$/, '');
    }

    // Step 5: CSS class names cannot start with a digit
    if (/^\d/.test(baseName)) {
      baseName = 'c-' + baseName;
    }

    // Step 6: Ensure uniqueness
    let candidate = baseName;
    if (this.usedClassNames.has(candidate)) {
      let suffix = 2;
      while (this.usedClassNames.has(`${baseName}-${suffix}`)) {
        suffix++;
      }
      candidate = `${baseName}-${suffix}`;
    }

    this.usedClassNames.add(candidate);
    return candidate;
  }

  /**
   * Infers a meaningful class name from layer type and visual properties.
   * Used when the original layer name is generic (e.g. "编组", "矩形", "unnamed").
   */
  private inferClassName(layer: Layer): string {
    this.classNameCounter++;

    // Type-based prefix
    const typePrefix: Record<string, string> = {
      [LayerType.TEXT]: 'txt',
      [LayerType.SHAPE]: 'shape',
      [LayerType.GROUP]: 'grp',
      [LayerType.IMAGE]: 'img',
      [LayerType.SYMBOL]: 'sym',
      [LayerType.ARTBOARD]: 'board',
    };
    const prefix = typePrefix[layer.type] || 'el';

    // Collect visual hints
    const hints: string[] = [];
    const props: Record<string, string> = {};
    this.applyBaseProperties(layer, props);

    // Check for background color
    if (layer.type === LayerType.SHAPE) {
      const shape = layer as ShapeLayer;
      if (shape.fills?.some(f => f.isEnabled)) {
        const fill = shape.fills.find(f => f.isEnabled);
        if (fill?.type === 'color' && fill.color) {
          // Map common colors to names
          const colorMap: Record<string, string> = {
            '#FFFFFF': 'white', '#FFF': 'white',
            '#F8FAFC': 'light', '#F0F2F5': 'light', '#F8F9FC': 'light',
            '#EBF1FF': 'blue-light', '#EBF8FF': 'blue-light',
            '#000000': 'dark', '#1E293B': 'dark',
          };
          const hex = fill.color.toUpperCase();
          if (colorMap[hex]) hints.push(colorMap[hex]);
        }
      }
      if (shape.borders?.some(b => b.isEnabled)) hints.push('bordered');
      if (shape.shadows?.some(s => s.isEnabled)) hints.push('shadow');
      if (layer.cornerRadius > 0) hints.push('rounded');
      if ((layer as ShapeLayer).shapeType === 'oval') hints.push('circle');
    }

    if (layer.type === LayerType.TEXT) {
      const textLayer = layer as TextLayer;
      if (textLayer.content) {
        // Use first meaningful word from text content
        const text = textLayer.content.trim().replace(/[^\w一-鿿]/g, '');
        if (text.length > 0 && text.length <= 6) {
          return BEMGenerator.toClassName(text);
        }
        if (text.length > 6) {
          return BEMGenerator.toClassName(text.substring(0, 6));
        }
      }
    }

    // Size-based hints
    const ratio = layer.rect.width / (layer.rect.height || 1);
    if (ratio > 5) hints.push('bar');
    else if (ratio < 0.2) hints.push('bar-v');
    else if (Math.abs(ratio - 1) < 0.1 && layer.rect.width < 30) hints.push('icon');
    else if (Math.abs(ratio - 1) < 0.1) hints.push('square');

    // Position-based hints (top area = header, left area = sidebar, etc)
    if (layer.rect.y < 60 && layer.rect.width > 200) hints.push('top');
    if (layer.rect.x < 50 && layer.rect.height > 200) hints.push('left');

    const hint = hints.length > 0 ? '-' + hints.slice(0, 2).join('-') : '';
    return prefix + hint + '-' + this.classNameCounter;
  }

  /**
   * Makes a class name unique by appending a numeric suffix.
   */
  private makeUnique(base: string): string {
    let counter = 1;
    let candidate = `${base}-${counter}`;
    while (this.usedClassNames.has(candidate)) {
      counter++;
      candidate = `${base}-${counter}`;
    }
    return candidate;
  }

  /**
   * Applies base positioning/transform properties common to all layers.
   */
  private applyBaseProperties(layer: BaseLayer, props: Record<string, string>): void {
    const rect = layer.rect;

    // Position: all layers use absolute positioning
    // Sketch stores coordinates relative to parent, so use them as-is
    props['position'] = 'absolute';
    props['left'] = `${Math.round(rect.x)}px`;
    props['top'] = `${Math.round(rect.y)}px`;
    props['width'] = `${Math.round(rect.width)}px`;
    props['height'] = `${Math.round(rect.height)}px`;

    // Opacity (only if not fully opaque)
    if (layer.opacity < 0.995) {
      props['opacity'] = layer.opacity.toFixed(4);
    }

    // Rotation
    if (layer.rotation !== 0) {
      props['transform'] = `rotate(${Math.round(layer.rotation)}deg)`;
    }

    // Border radius
    if (layer.cornerRadius > 0) {
      props['border-radius'] = `${Math.round(layer.cornerRadius)}px`;
    }

    // Clip content (overflow hidden)
    if (layer.clipsContent) {
      props['overflow'] = 'hidden';
    }

    // Mix blend mode (skip default 'normal')
    if (layer.blendMode && String(layer.blendMode) !== 'normal') {
      props['mix-blend-mode'] = blendModeToCSS(layer.blendMode);
    }
  }

  /**
   * Applies text-specific properties from a TextLayer.
   */
  private applyTextProperties(layer: TextLayer, props: Record<string, string>): void {
    const style = layer.textStyle;
    if (!style) return;

    // Font family
    if (style.fontFamily) {
      // Quote font family names that contain spaces
      const fontFamily = style.fontFamily.includes(' ')
        ? `"${style.fontFamily}"`
        : style.fontFamily;
      props['font-family'] = fontFamily;
    }

    // Font size
    if (style.fontSize) {
      props['font-size'] = `${Math.round(style.fontSize)}px`;
    }

    // Font weight
    if (style.fontWeight) {
      props['font-weight'] = String(style.fontWeight);
    }

    // Line height
    if (style.lineHeight !== undefined && style.lineHeight !== null) {
      props['line-height'] = `${Math.round(style.lineHeight)}px`;
    }

    // Letter spacing
    if (style.letterSpacing !== undefined && style.letterSpacing !== null) {
      props['letter-spacing'] = `${Math.round(style.letterSpacing)}px`;
    }

    // Text align
    if (style.textAlign) {
      props['text-align'] = style.textAlign;
    }

    // Text color - prefer textStyle.color, fallback to layer fills
    const textColor = style.color || this.extractColorFromLayer(layer);
    if (textColor) {
      props['color'] = sketchColorToCSS(textColor);
    }
  }

  /**
   * Applies shape-specific properties from a ShapeLayer.
   */
  private applyShapeProperties(layer: ShapeLayer, props: Record<string, string>): void {
    // Fills (background)
    this.applyFills(layer.fills, props);

    // Borders
    this.applyBorders(layer.borders, props);

    // Shadows
    this.applyShadows(layer.shadows, props);

    // Oval shapes get border-radius: 50%
    if (layer.shapeType === 'oval') {
      props['border-radius'] = '50%';
    }
  }

  /**
   * Applies container properties for groups, artboards, and components.
   */
  private applyContainerProperties(
    layer: GroupLayer | ArtboardLayer | ComponentLayer,
    props: Record<string, string>
  ): void {
    // Artboard background color
    if (layer.type === LayerType.ARTBOARD) {
      const artboard = layer as ArtboardLayer;
      if (artboard.backgroundColor) {
        props['background-color'] = artboard.backgroundColor;
      }
    }

    // Groups without clipsContent should not have overflow:hidden
    // (already handled in base properties)
  }

  /**
   * Applies image-specific properties.
   */
  private applyImageProperties(props: Record<string, string>): void {
    props['background-size'] = 'cover';
    props['background-position'] = 'center';
    props['background-repeat'] = 'no-repeat';
  }

  /**
   * Converts fill styles to CSS background properties.
   */
  private applyFills(fills: FillStyle[], props: Record<string, string>): void {
    const enabledFills = fills.filter((f) => f.isEnabled);
    if (enabledFills.length === 0) return;

    // Use only the first enabled fill for background
    const fill = enabledFills[0];

    if (fill.type === 'gradient' && fill.gradient) {
      props['background'] = gradientToCSS(fill.gradient, fill.opacity);
    } else if (fill.type === 'color') {
      const colorCSS = sketchColorToCSS(fill.color);
      if (fill.opacity < 0.995 && fill.color?.startsWith('#')) {
        // Need to apply opacity to the color
        const r = parseInt(fill.color.slice(1, 3), 16);
        const g = parseInt(fill.color.slice(3, 5), 16);
        const b = parseInt(fill.color.slice(5, 7), 16);
        props['background-color'] = `rgba(${r}, ${g}, ${b}, ${fill.opacity.toFixed(4)})`;
      } else {
        props['background-color'] = colorCSS;
      }
    }
    // Pattern fills are not directly supported - skip
  }

  /**
   * Converts border styles to CSS border properties.
   */
  private applyBorders(borders: BorderStyle[], props: Record<string, string>): void {
    const enabledBorders = borders.filter((b) => b.isEnabled);
    if (enabledBorders.length === 0) return;

    // Combine all enabled borders into a single border property
    const borderParts: string[] = [];

    for (const border of enabledBorders) {
      const thickness = Math.round(border.thickness);
      if (thickness <= 0) continue;

      const colorCSS = sketchColorToCSS(border.color);
      const opacity = border.opacity;

      // Build the border string
      let borderColor = colorCSS;
      if (opacity < 0.995 && border.color?.startsWith('#')) {
        const r = parseInt(border.color.slice(1, 3), 16);
        const g = parseInt(border.color.slice(3, 5), 16);
        const b = parseInt(border.color.slice(5, 7), 16);
        borderColor = `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(4)})`;
      }

      borderParts.push(`${thickness}px solid ${borderColor}`);

      // Handle border position (inside/outside)
      if (border.position === 'inside') {
        // Shift the border inward by adjusting box model
        // box-sizing is already content-box by default, but we use outline to avoid layout shift
        props['box-sizing'] = 'border-box';
      }
    }

    if (borderParts.length > 0) {
      props['border'] = borderParts.join(', ');
    }
  }

  /**
   * Converts shadow styles to CSS box-shadow properties.
   */
  private applyShadows(shadows: ShadowStyle[], props: Record<string, string>): void {
    const enabledShadows = shadows.filter((s) => s.isEnabled);
    if (enabledShadows.length === 0) return;

    const shadowValues = enabledShadows.map(shadowToCSS).filter(Boolean);
    if (shadowValues.length > 0) {
      props['box-shadow'] = shadowValues.join(', ');
    }
  }

  /**
   * Extracts color from a layer's fills (fallback for text color).
   */
  private extractColorFromLayer(layer: any): any {
    if (
      'fills' in layer &&
      Array.isArray(layer.fills) &&
      layer.fills.length > 0 &&
      layer.fills[0].isEnabled
    ) {
      const fill = layer.fills[0];
      if (fill.type === 'color') {
        return fill.color;
      }
    }
    return null;
  }
}
