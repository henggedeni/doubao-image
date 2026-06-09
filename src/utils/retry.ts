/**
 * 通用重试工具模块
 * 支持自定义重试次数、间隔、指数退避策略
 */

import * as logger from "../utils/logger.js";

/** 重试选项接口 */
export interface RetryOptions {
  /** 最大重试次数（不含首次执行） */
  maxRetries: number;
  /** 初始重试间隔（毫秒） */
  initialDelay: number;
  /** 是否使用指数退避 */
  exponentialBackoff: boolean;
  /** 退避倍数（默认 2） */
  backoffMultiplier: number;
  /** 最大退避间隔（毫秒） */
  maxDelay: number;
  /** 重试前的判断函数，返回 true 表示该错误可重试 */
  retryable?: (error: unknown) => boolean;
}

/** 默认重试选项 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  exponentialBackoff: true,
  backoffMultiplier: 2,
  maxDelay: 30000,
};

/**
 * 延时函数
 * @param ms - 延时毫秒数
 * @returns Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 计算当前重试的等待时间
 * @param attempt - 当前重试次数（从 0 开始）
 * @param options - 重试选项
 * @returns 等待时间（毫秒）
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  if (!options.exponentialBackoff) {
    return options.initialDelay;
  }
  const delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  return Math.min(delay, options.maxDelay);
}

/**
 * 通用重试函数
 * 在失败时自动重试，支持指数退避
 *
 * @param fn - 需要重试的异步函数
 * @param options - 重试选项（部分可选，合并默认值）
 * @returns 函数执行结果
 * @throws 重试耗尽后抛出最后一次的错误
 *
 * @example
 * ```ts
 * const result = await retry(() => fetch(url), { maxRetries: 5, initialDelay: 2000 });
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  partialOptions?: Partial<RetryOptions>
): Promise<T> {
  const options: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...partialOptions };
  let lastError: unknown = undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // 检查该错误是否可重试
      if (options.retryable && !options.retryable(err)) {
        logger.error(`错误不可重试，直接抛出: ${String(err)}`);
        throw err;
      }

      if (attempt < options.maxRetries) {
        const delay = calculateDelay(attempt, options);
        logger.warn(
          `第 ${attempt + 1} 次重试（共 ${options.maxRetries} 次），${delay}ms 后重试... 错误: ${String(err)}`
        );
        await sleep(delay);
      }
    }
  }

  logger.error(`重试 ${options.maxRetries} 次后仍失败: ${String(lastError)}`);
  throw lastError;
}
