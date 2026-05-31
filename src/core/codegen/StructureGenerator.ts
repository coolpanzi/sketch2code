/**
 * Phase 2: Structure Generator
 * Generates HTML structure only (no CSS) using LLM, given CSS class names and layer tree.
 */

import type {
  Layer,
  CSSPropertiesMap,
  StructureResult,
} from '../types.js';
import { LayerType } from '../types.js';

// ─── Layer Tree Summary Builder ───────────────────────────────────────────

/**
 * Builds a text representation of the layer tree for LLM input.
 * Includes layer names, types, dimensions, text content, and associated CSS class names.
 */
export function buildLayerTreeSummary(
  layers: Layer[],
  cssMap: CSSPropertiesMap,
  layerClassMap: Map<string, string>,
  indent: number = 0
): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  for (const layer of layers) {
    const className = layerClassMap.get(layer.id) || '(no class)';
    const css = cssMap[className];
    const w = Math.round(layer.rect.width);
    const h = Math.round(layer.rect.height);

    // Layer header line
    const typeLabel = String(layer.type);
    const textHint =
      layer.type === LayerType.TEXT
        ? ` text="${(layer as any).content?.slice(0, 40) || ''}"`
        : '';
    lines.push(
      `${prefix}<div class="${className}"> <!-- ${typeLabel} "${layer.name}" ${w}x${h}${textHint} -->`
    );

    // Recurse into children
    if (
      'layers' in layer &&
      Array.isArray((layer as any).layers) &&
      (layer as any).layers.length > 0
    ) {
      const childSummary = buildLayerTreeSummary(
        (layer as any).layers,
        cssMap,
        layerClassMap,
        indent + 1
      );
      if (childSummary) {
        lines.push(childSummary);
      }
    }

    // Close tag
    lines.push(`${prefix}</div>`);
  }

  return lines.join('\n');
}

// ─── Structure Generator ───────────────────────────────────────────────────

// Lazy-loaded config module references
let configModule: any;
let createLLMClient: any;

async function getConfig() {
  if (!configModule) {
    const projectRoot = process.cwd();
    const configPath = `${projectRoot}/src/config.ts`;
    const fileUrl = `file://${configPath}`;
    configModule = await import(fileUrl);
    createLLMClient = configModule.createLLMClient;
  }
  return configModule;
}

/**
 * Generates HTML structure (template + script) from layer tree using an LLM.
 * The LLM receives layer structure and CSS class names, and outputs Vue 3 SFC content.
 */
export class StructureGenerator {
  private llmClient: any;

  constructor() {
    this.llmClient = null;
  }

  /**
   * Main entry point: generates HTML structure for a component.
   *
   * @param componentName - The Vue component name
   * @param artboard - The root artboard layer
   * @param cssMap - CSS class -> properties mapping (from Phase 1)
   * @param layerClassMap - Layer ID -> CSS class name mapping (from Phase 1)
   * @returns The generated template and script strings
   */
  async generate(
    componentName: string,
    artboard: Layer,
    cssMap: CSSPropertiesMap,
    layerClassMap: Map<string, string>
  ): Promise<StructureResult> {
    // Initialize LLM client
    if (!this.llmClient) {
      const config = await getConfig();
      const loadedConfig = await config.loadConfig();
      this.llmClient = createLLMClient(loadedConfig);
    }

    // Build the layer tree summary for the LLM
    const layers =
      'layers' in artboard && Array.isArray((artboard as any).layers)
        ? (artboard as any).layers
        : [artboard];
    const treeSummary = buildLayerTreeSummary(
      layers,
      cssMap,
      layerClassMap
    );

    // Collect available class names - limit to avoid overwhelming LLM
    const allClasses = Object.keys(cssMap);
    const MAX_CLASSES_IN_PROMPT = 80;
    const availableClasses = allClasses.length > MAX_CLASSES_IN_PROMPT
      ? allClasses.slice(0, MAX_CLASSES_IN_PROMPT).join(', ') + `, ... (${allClasses.length} total)`
      : allClasses.join(', ');

    // Truncate tree summary if too long
    const MAX_TREE_LENGTH = 4000;
    const trimmedSummary = treeSummary.length > MAX_TREE_LENGTH
      ? treeSummary.substring(0, MAX_TREE_LENGTH) + '\n... (truncated)'
      : treeSummary;

    // Build prompts
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(
      componentName,
      trimmedSummary,
      availableClasses
    );

    // Call LLM
    const config = await getConfig();
    const loadedConfig = await config.loadConfig();

    const response = await this.llmClient.chat.completions.create({
      model: loadedConfig.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: loadedConfig.maxTokens || 16000,
    });

    const content = response.choices?.[0]?.message?.content || '';

    // Parse JSON response
    return this.parseResponse(content, componentName);
  }

  /**
   * System prompt: instructs LLM to ONLY generate HTML structure, NEVER CSS.
   */
  private buildSystemPrompt(): string {
    return `You are a Vue 3 component structure generator. Your job is to generate HTML template and script setup code ONLY.

CRITICAL RULES:
1. NEVER write any CSS or style code - all styling is handled by a separate algorithm
2. ONLY use the CSS class names provided in the user message
3. Output valid JSON with two fields: "template" (HTML string) and "script" (TypeScript code for <script setup>)
4. The template should use the exact class names provided
5. Add proper Vue 3 semantics: use v-for for repeating patterns, v-if for conditional rendering
6. Use semantic HTML where appropriate but keep the provided class names intact
7. The script section should contain reactive data, computed properties, and methods as needed
8. Return ONLY the JSON object, no markdown, no explanations

Output format: {"template": "<div>...</div>", "script": "import { ref } from 'vue'\\n..."} `;
  }

  /**
   * Builds the user message with layer tree and available classes.
   */
  private buildUserMessage(
    componentName: string,
    treeSummary: string,
    availableClasses: string
  ): string {
    return `Generate a Vue 3 component called "${componentName}".

Available CSS classes (use ONLY these, do NOT invent new ones):
${availableClasses}

Layer tree structure (each layer already has its CSS class):
${treeSummary}

Instructions:
- Build a semantic HTML structure using the class names above
- Replace placeholder text layers with actual text content from the tree
- Add Vue 3 script setup code if there are interactive elements
- Do NOT write any CSS/styles
- Return JSON: {"template": "...", "script": "..."}`;
  }

  /**
   * Parses the LLM response into a StructureResult.
   * Handles Qwen model thinking prefix removal and JSON extraction.
   */
  private parseResponse(content: string, componentName: string): StructureResult {
    let cleaned = content.trim();

    // Handle Qwen thinking prefix removal
    // Qwen models sometimes output a "Thinking Process" or "Here's a thinking process" prefix
    cleaned = this.removeThinkingPrefix(cleaned);

    // Extract JSON from response
    cleaned = this.extractJson(cleaned);

    try {
      const parsed = JSON.parse(cleaned);
      return {
        template: parsed.template || '',
        script: parsed.script || '',
      };
    } catch (error) {
      // Try to fix common JSON issues (unescaped newlines in strings)
      try {
        const fixed = this.attemptJsonFix(cleaned);
        const parsed = JSON.parse(fixed);
        return {
          template: parsed.template || '',
          script: parsed.script || '',
        };
      } catch (fixError) {
        console.error(
          `[StructureGenerator] Failed to parse LLM response for "${componentName}":`,
          (fixError as Error).message
        );
        console.error('Response content:', content.substring(0, 500));
        // Return empty result so the pipeline doesn't crash
        return {
          template: '',
          script: '',
        };
      }
    }
  }

  /**
   * Removes Qwen-style thinking prefix from response content.
   */
  private removeThinkingPrefix(text: string): string {
    // Pattern 1: "Thinking Process:" followed by content until ```json or {
    const thinkingPatterns = [
      /(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=```json)/s,
      /(?:Thinking Process:.*?|Here's a thinking process:.*?)(?=\{)/s,
      /<think[\s\S]*?<\/think>/s, // Some models use <think/> tags
    ];

    for (const pattern of thinkingPatterns) {
      const match = text.match(pattern);
      if (match) {
        return text.substring(match[0].length).trim();
      }
    }

    return text;
  }

  /**
   * Extracts JSON from response text, handling code blocks and raw JSON.
   */
  private extractJson(text: string): string {
    // Try JSON code block first
    const jsonCodeBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonCodeBlockMatch) {
      return jsonCodeBlockMatch[1].trim();
    }

    // Try generic code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Fall back to finding a raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return text;
  }

  /**
   * Attempts to fix common JSON formatting issues in LLM output.
   */
  private attemptJsonFix(jsonString: string): string {
    let fixed = jsonString;

    // Fix unescaped newlines inside quoted string values
    fixed = fixed.replace(
      /"((?:[^"\\]|\\.)*)\n((?:[^"\\]|\\.)*)"/g,
      (match, p1, p2) => `"${p1}\\n${p2}"`
    );

    return fixed;
  }
}
