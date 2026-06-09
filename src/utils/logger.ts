/**
 * 日志工具模块
 * 分级日志（info/warn/error），带时间戳和可选颜色输出
 */

/** 日志级别 */
export type LogLevel = "info" | "warn" | "error";

/** 日志级别颜色映射 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  info: "\x1b[36m",   // 青色
  warn: "\x1b[33m",   // 黄色
  error: "\x1b[31m",  // 红色
};

/** 重置颜色 */
const RESET_COLOR = "\x1b[0m";

/** 是否启用颜色输出 */
let colorEnabled = true;

/**
 * 设置是否启用颜色输出
 * @param enabled - 是否启用颜色
 */
export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

/**
 * 格式化时间戳
 * @returns 格式化的时间字符串
 */
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 内部日志输出函数
 * @param level - 日志级别
 * @param message - 日志消息
 * @param args - 附加参数
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  const timestamp = formatTimestamp();
  const levelStr = level.toUpperCase().padEnd(5);

  if (colorEnabled) {
    const color = LEVEL_COLORS[level];
    console.log(`${timestamp} ${color}[${levelStr}]${RESET_COLOR} ${message}`, ...args);
  } else {
    console.log(`${timestamp} [${levelStr}] ${message}`, ...args);
  }
}

/**
 * 信息级别日志
 * @param message - 日志消息
 * @param args - 附加参数
 */
export function info(message: string, ...args: unknown[]): void {
  log("info", message, ...args);
}

/**
 * 警告级别日志
 * @param message - 日志消息
 * @param args - 附加参数
 */
export function warn(message: string, ...args: unknown[]): void {
  log("warn", message, ...args);
}

/**
 * 错误级别日志
 * @param message - 日志消息
 * @param args - 附加参数
 */
export function error(message: string, ...args: unknown[]): void {
  log("error", message, ...args);
}
