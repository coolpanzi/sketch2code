/**
 * sketch2code 核心类型定义
 * 统一的项目类型系统，确保所有模块使用一致的数据结构
 */

// ─── 基础类型 ─────────────────────────────────────────────────────────────

/**
 * 唯一标识符类型
 */
export type UUID = string;

/**
 * 颜色值（十六进制格式）
 */
export type HexColor = string;

/**
 * 位置坐标
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 尺寸大小
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * 矩形边界
 */
export interface Rect extends Point, Size {}

/**
 * 边距/内边距
 */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// ─── 设计系统类型 ───────────────────────────────────────────────────────────

/**
 * 颜色定义
 */
export interface ColorDefinition {
  id: UUID;
  name: string;
  hex: HexColor;
  usage: string[]; // 使用该颜色的图层名称
  source: 'document' | 'extracted'; // 来源
}

/**
 * 文本样式定义
 */
export interface TextStyleDefinition {
  id: UUID;
  name: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: HexColor;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justified';
}

/**
 * 图层样式定义
 */
export interface LayerStyleDefinition {
  id: UUID;
  name: string;
  fills: FillStyle[];
  borders: BorderStyle[];
  shadows: ShadowStyle[];
}

/**
 * 填充样式
 */
export interface FillStyle {
  type: 'color' | 'gradient' | 'pattern';
  color: HexColor;
  opacity: number;
  isEnabled: boolean;
  gradient?: GradientInfo;
}

/**
 * 渐变信息
 */
export interface GradientInfo {
  type: 'linear' | 'radial' | 'angular';
  from: Point;
  to: Point;
  stops: GradientStop[];
}

/**
 * 渐变停止点
 */
export interface GradientStop {
  color: HexColor;
  position: number; // 0-1
}

/**
 * 边框样式
 */
export interface BorderStyle {
  color: HexColor;
  thickness: number;
  position: 'center' | 'inside' | 'outside';
  opacity: number;
  isEnabled: boolean;
}

/**
 * 阴影样式
 */
export interface ShadowStyle {
  color: HexColor;
  blurRadius: number;
  offsetX: number;
  offsetY: number;
  spread: number;
  isEnabled: boolean;
  isInner: boolean;
}

/**
 * 设计系统
 */
export interface DesignSystem {
  colors: ColorDefinition[];
  textStyles: TextStyleDefinition[];
  layerStyles: LayerStyleDefinition[];
  gradients: GradientInfo[];
  spacing: Spacing[];
}

// ─── 图层类型 ───────────────────────────────────────────────────────────────

/**
 * 图层类型枚举
 */
export enum LayerType {
  ARTBOARD = 'artboard',
  GROUP = 'group',
  SYMBOL = 'symbol',
  COMPONENT = 'component',
  TEXT = 'text',
  SHAPE = 'shape',
  IMAGE = 'image',
  FRAME = 'frame',
  UNKNOWN = 'unknown'
}

/**
 * 混合模式
 */
export enum BlendMode {
  NORMAL = 'normal',
  DARKEN = 'darken',
  MULTIPLY = 'multiply',
  COLOR_BURN = 'color-burn',
  LIGHTEN = 'lighten',
  SCREEN = 'screen',
  COLOR_DODGE = 'color-dodge',
  OVERLAY = 'overlay',
  SOFT_LIGHT = 'soft-light',
  HARD_LIGHT = 'hard-light',
  DIFFERENCE = 'difference',
  EXCLUSION = 'exclusion',
  HUE = 'hue',
  SATURATION = 'saturation',
  COLOR = 'color',
  LUMINOSITY = 'luminosity'
}

/**
 * 基础图层接口
 */
export interface BaseLayer {
  id: UUID;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  rotation: number;
  rect: Rect;
  cornerRadius: number;
  clipsContent: boolean;
}

/**
 * 文本图层
 */
export interface TextLayer extends BaseLayer {
  type: LayerType.TEXT;
  content: string;
  textStyle: TextStyleDefinition;
  attributedString?: any; // 原始属性字符串
}

/**
 * 形状图层
 */
export interface ShapeLayer extends BaseLayer {
  type: LayerType.SHAPE;
  shapeType: 'rectangle' | 'oval' | 'star' | 'triangle' | 'polygon' | 'path';
  fills: FillStyle[];
  borders: BorderStyle[];
  shadows: ShadowStyle[];
}

/**
 * 图像图层
 */
export interface ImageLayer extends BaseLayer {
  type: LayerType.IMAGE;
  imageData: {
    ref: string;
    data: Buffer;
    width: number;
    height: number;
  };
}

/**
 * 组合图层
 */
export interface GroupLayer extends BaseLayer {
  type: LayerType.GROUP;
  layers: Layer[];
  layoutInfo?: {
    layout: 'flex' | 'grid' | 'absolute';
    align: string;
    distribution: string;
    spacing: number;
  };
}

/**
 * Artboard图层
 */
export interface ArtboardLayer extends BaseLayer {
  type: LayerType.ARTBOARD;
  layers: Layer[];
  backgroundColor?: HexColor;
  resizeMode?: 'fit' | 'fill' | 'stretch';
}

/**
 * Symbol图层
 */
export interface SymbolLayer extends BaseLayer {
  type: LayerType.SYMBOL;
  symbolMasterId: UUID;
  symbolMasterName: string;
  overrides?: Map<string, any>; // Symbol实例的覆盖属性
}

/**
 * Component图层（Symbol Master）
 */
export interface ComponentLayer extends BaseLayer {
  type: LayerType.COMPONENT;
  layers: Layer[];
  instances: UUID[]; // 引用此Component的Symbol实例ID列表
}

/**
 * 未知图层（无法识别类型的兜底）
 */
export interface UnknownLayer extends BaseLayer {
  type: LayerType.UNKNOWN;
  rawClass?: string; // 原始 _class 值，用于调试
}

/**
 * 图层联合类型
 */
export type Layer =
  | TextLayer
  | ShapeLayer
  | ImageLayer
  | GroupLayer
  | ArtboardLayer
  | SymbolLayer
  | ComponentLayer
  | UnknownLayer;

/**
 * 页面定义
 */
export interface Page {
  id: UUID;
  name: string;
  artboards: ArtboardLayer[];
  symbols: ComponentLayer[];
  layers: Layer[];
  // 页面元数据
  metadata: {
    totalLayers: number;
    actualDimensions: Size;
    layoutBounds: Rect;
  };
}

// ─── Sketch文件类型 ───────────────────────────────────────────────────────────

/**
 * Sketch文件元数据
 */
export interface SketchMetadata {
  version: string;
  colorSpace: 'Unmanaged' | 'sRGB' | 'P3';
  appVersion: string;
  modifiedDate?: string;
  commit?: string;
}

/**
 * 解析后的Sketch文件
 */
export interface SketchFile {
  metadata: SketchMetadata;
  pages: Page[];
  designSystem: DesignSystem;
  images: Record<string, Buffer>;
  symbolUsage: {
    totalSymbols: number;
    uniqueComponents: number;
    componentMap: Map<UUID, { name: string; instanceCount: number }>;
  };
}

// ─── 分析结果类型 ───────────────────────────────────────────────────────────

/**
 * 布局区域类型
 */
export enum RegionType {
  HEADER = 'header',
  SIDEBAR = 'sidebar',
  MAIN = 'main',
  FOOTER = 'footer',
  OVERLAY = 'overlay',
  BACKGROUND = 'background',
  UNKNOWN = 'unknown'
}

/**
 * 检测到的布局区域
 */
export interface LayoutRegion {
  type: RegionType;
  label: string;
  bounds: Rect;
  confidence: number; // 0-1
  content: {
    layers: Layer[];
    dominantColors: HexColor[];
    textItems: string[];
  };
}

/**
 * 组件模式识别结果
 */
export enum ComponentPattern {
  NAVIGATION = 'navigation',
  SIDEBAR_MENU = 'sidebar-menu',
  DATA_TABLE = 'data-table',
  CARD = 'card',
  CHART = 'chart',
  FORM = 'form',
  BUTTON = 'button',
  ALERT = 'alert',
  UNKNOWN = 'unknown'
}

/**
 * 识别的组件
 */
export interface DetectedComponent {
  id: UUID;
  name: string;
  pattern: ComponentPattern;
  bounds: Rect;
  layers: Layer[];
  confidence: number;
  properties: {
    hasText: boolean;
    hasImage: boolean;
    hasBackground: boolean;
    isInteractive: boolean;
  };
}

/**
 * 图像分析结果
 */
export interface ImageAnalysis {
  metadata: {
    width: number;
    height: number;
    format: string;
    dominantColor: HexColor;
    brightness: number;
  };
  palette: Array<{
    hex: HexColor;
    percentage: number;
    usage: string[];
  }>;
  layout: LayoutRegion[];
  style: {
    isDark: boolean;
    isColorful: boolean;
    isMinimal: boolean;
    colorScheme: 'monochrome' | 'analogous' | 'complementary' | 'triadic';
  };
  textRegions: Array<{
    bounds: Rect;
    confidence: number;
  }>;
}

// ─── 代码生成类型 ───────────────────────────────────────────────────────────

/**
 * 生成配置
 */
export interface GenerationConfig {
  framework: 'vue' | 'react' | 'html';
  cssFramework: 'tailwind' | 'css' | 'scss';
  outputFormat: 'sfc' | 'jsx' | 'html';
  componentName: string;
  enableVerification: boolean;
}

/**
 * 生成结果
 */
export interface GenerationResult {
  componentName: string;
  template: string;
  script: string;
  style: string;
  fileName: string;
  usedTokens: {
    colors: string[];
    spacing: Spacing[];
    typography: TextStyleDefinition[];
  };
  metadata: {
    generationTime: number;
    llmCalls: number;
    accuracy?: number;
  };
}

/**
 * 验证结果
 */
export interface VerificationResult {
  passed: boolean;
  accuracy: number; // 0-100
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    category: string;
    message: string;
    location?: string;
  }>;
  summary: string;
}

// ─── 错误处理类型 ───────────────────────────────────────────────────────────

/**
 * 错误类型
 */
export enum ErrorType {
  PARSE_ERROR = 'parse-error',
  ANALYSIS_ERROR = 'analysis-error',
  GENERATION_ERROR = 'generation-error',
  VALIDATION_ERROR = 'validation-error',
  FILE_ERROR = 'file-error',
  NETWORK_ERROR = 'network-error'
}

/**
 * 应用错误
 */
export class Sketch2CodeError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'Sketch2CodeError';
  }
}

// ─── 分层还原类型 ───────────────────────────────────────────────────────────

export type CSSValue = string;

export interface CSSPropertiesMap {
  [className: string]: {
    [property: string]: CSSValue;
  };
}

export interface BEMName {
  block: string;
  element?: string;
  modifier?: string;
  full: string;
}

export interface PropertyToCSSResult {
  cssMap: CSSPropertiesMap;
  layerClassMap: Map<string, string>;
}

export interface StructureResult {
  template: string;
  script: string;
}

export interface LayoutConvertResult {
  cssMap: CSSPropertiesMap;
  convertedClasses: string[];
}

// ─── 工具类型 ───────────────────────────────────────────────────────────────

/**
 * 可选字段
 */
export type Optional<T> = T | null | undefined;

/**
 * 深度只读
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/**
 * 部分更新
 */
export type PartialUpdate<T> = {
  [P in keyof T]?: T[P];
};
