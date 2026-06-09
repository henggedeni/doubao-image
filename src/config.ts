/**
 * 配置管理模块
 * 使用 dotenv 加载环境变量，导出类型安全的配置对象
 * 仅使用 Kimi 作为视觉识别模型
 */
import dotenv from "dotenv";

dotenv.config();

/** 应用配置接口 */
export interface AppConfig {
  /** Kimi API 密钥 */
  kimiApiKey: string;
  /** Kimi API 基础地址 */
  kimiBaseUrl: string;
  /** Kimi 模型名称 */
  kimiModel: string;
  /** 轮询间隔（毫秒） */
  pollInterval: number;
  /** 截图最大宽度（像素） */
  screenshotMaxWidth: number;
  /** 截图 JPEG 质量 (1-100) */
  screenshotQuality: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 最大轮询次数 */
  maxPollCount: number;
  /** AI 调用超时时间（毫秒） */
  aiTimeout: number;
  /** 截图保存目录（空字符串表示不保存到本地） */
  screenshotSaveDir: string;
  /** 截图文件名前缀 */
  screenshotSavePrefix: string;
}

/**
 * 解析正整数环境变量
 * @param value - 环境变量原始值
 * @param defaultValue - 默认值
 * @returns 解析后的正整数
 */
function parsePositiveInt(
  value: string | undefined,
  defaultValue: number
): number {
  if (value === undefined || value.trim() === "") {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

/**
 * 获取必需的环境变量，缺失时抛出明确错误
 * @param key - 环境变量名
 * @param label - 用于错误提示的中文名
 * @returns 环境变量值
 */
function requireEnv(key: string, label: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`配置缺失：请在 .env 文件中设置 ${key}（${label}）`);
  }
  return value;
}

/**
 * 获取可选的环境变量，缺失时使用默认值
 * @param key - 环境变量名
 * @param defaultValue - 默认值
 * @returns 环境变量值或默认值
 */
function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key]?.trim() || defaultValue;
}

/** 应用配置单例 */
export const config: AppConfig = {
  kimiApiKey: requireEnv("KIMI_API_KEY", "Kimi API 密钥"),
  kimiBaseUrl: optionalEnv("KIMI_BASE_URL", "https://api.moonshot.cn/v1"),
  kimiModel: optionalEnv("KIMI_MODEL", "moonshot-v1-vision-preview"),
  pollInterval: parsePositiveInt(process.env.POLL_INTERVAL, 3000),
  screenshotMaxWidth: parsePositiveInt(process.env.SCREENSHOT_MAX_WIDTH, 1920),
  screenshotQuality: parsePositiveInt(process.env.SCREENSHOT_QUALITY, 80),
  maxRetries: parsePositiveInt(process.env.MAX_RETRIES, 3),
  maxPollCount: parsePositiveInt(process.env.MAX_POLL_COUNT, 100),
  aiTimeout: parsePositiveInt(process.env.AI_TIMEOUT, 30000),
  screenshotSaveDir: optionalEnv("SCREENSHOT_SAVE_DIR", "screenshots"),
  screenshotSavePrefix: optionalEnv("SCREENSHOT_SAVE_PREFIX", "kimi"),
};

/**
 * 打印当前配置信息（隐藏敏感字段）
 */
export function printConfig(): void {
  console.log("========== 当前配置 ==========");
  console.log(`Kimi: ${config.kimiBaseUrl} / ${config.kimiModel}`);
  console.log(`轮询间隔: ${config.pollInterval}ms`);
  console.log(`截图最大宽度: ${config.screenshotMaxWidth}px`);
  console.log(`截图质量: ${config.screenshotQuality}`);
  console.log(`最大重试: ${config.maxRetries} 次`);
  console.log(`最大轮询: ${config.maxPollCount} 次`);
  console.log(`AI 超时: ${config.aiTimeout}ms`);
  console.log(`截图保存目录: ${config.screenshotSaveDir || "(不保存)"}`);
  console.log("==============================");
}
