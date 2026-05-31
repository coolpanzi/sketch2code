/**
 * Configuration management for sketch2code
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { OpenAI } from 'openai';

export interface Config {
  /** LLM provider: 'omlx' | 'openai' | 'zhipu' | 'deepseek' */
  llmProvider: 'omlx' | 'openai' | 'zhipu' | 'deepseek' | 'openrouter';
  /** LLM model name (e.g. 'Qwen3.6-35B-A3B-UD-MLX-4bit') */
  llmModel: string;
  /** API base URL */
  llmBaseUrl: string;
  /** API key */
  apiKey: string;
  /** Temperature for generation (0-1) */
  temperature: number;
  /** Max tokens for generation */
  maxTokens: number;
  /** Output framework: 'vue' | 'react' */
  framework: 'vue';
  /** Output CSS: 'tailwind' | 'css' */
  cssFramework: 'tailwind';
  /** Component split mode: 'page' | 'auto' */
  componentSplit: 'page' | 'auto';
  /** Whether to enable visual verification */
  enableVerification: boolean;
  /** Verification model (needs vision support) */
  verificationModel: string;
  /** Verification base URL */
  verificationBaseUrl: string;
  /** Verification API key */
  verificationApiKey: string;
  /** Verification provider */
  verificationProvider: 'openai' | 'zhipu' | 'anthropic';
  /** Output directory */
  outputDir: string;
  /** Whether to use thinking/reasoning */
  enableThinking: boolean;
}

export const DEFAULT_CONFIG: Config = {
  llmProvider: 'omlx',
  llmModel: 'Qwen3.6-35B-A3B-4bit',
  llmBaseUrl: 'http://127.0.0.1:8888/v1',
  apiKey: 'omlx1234',
  temperature: 0.3,
  maxTokens: 16384,
  framework: 'vue',
  cssFramework: 'tailwind',
  componentSplit: 'auto',
  enableVerification: false,
  verificationModel: 'gpt-4o',
  verificationBaseUrl: 'https://api.openai.com/v1',
  verificationApiKey: '',
  verificationProvider: 'openai',
  outputDir: './output',
  enableThinking: false,
};

const CONFIG_DIR = path.join(process.env.HOME || '', '.sketch2code');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...userConfig };
  } catch {
    // No config file, return defaults
    await ensureConfigDir();
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: Partial<Config>): Promise<void> {
  await ensureConfigDir();
  const current = await loadConfig();
  const merged = { ...current, ...config };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

async function ensureConfigDir(): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

export function printConfig(config: Config): void {
  console.log('\n⚙️  sketch2code Configuration');
  console.log('────────────────────────────────────');
  console.log(`  LLM Provider : ${config.llmProvider}`);
  console.log(`  LLM Model    : ${config.llmModel}`);
  console.log(`  Base URL     : ${config.llmBaseUrl}`);
  console.log(`  API Key      : ${config.apiKey ? config.apiKey.slice(0, 4) + '***' : '(not set)'}`);
  console.log(`  Temperature  : ${config.temperature}`);
  console.log(`  Max Tokens   : ${config.maxTokens}`);
  console.log(`  Framework    : ${config.framework}`);
  console.log(`  CSS          : ${config.cssFramework}`);
  console.log(`  Split Mode   : ${config.componentSplit}`);
  console.log(`  Verification : ${config.enableVerification ? 'enabled' : 'disabled'}`);
  console.log(`  Output Dir   : ${config.outputDir}`);
  console.log('────────────────────────────────────\n');
}

/**
 * Get the openai-compatible client instance
 * Uses the openai npm package for all providers (they're all OpenAI-compatible)
 */
export function createLLMClient(config: Config): any {
  return new OpenAI({
    apiKey: config.apiKey || '***',
    baseURL: config.llmBaseUrl,
  });
}

export function createVerificationClient(config: Config): any {
  return new OpenAI({
    apiKey: config.verificationApiKey || '',
    baseURL: config.verificationBaseUrl,
  });
}
