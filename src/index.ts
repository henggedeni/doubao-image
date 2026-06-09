/**
 * 主入口模块
 * 编排自动化循环：识别输入框 → 监控图片生成 → 自动下载
 */

import { printConfig } from "./config.js";
import * as logger from "./utils/logger.js";
import { detectInputBox } from "./core/detector.js";
import { monitorImageGeneration, type MonitorResult } from "./core/monitor.js";
import { executeDownload } from "./core/downloader.js";

/** 运行状态标志 */
let isRunning = false;

/**
 * 优雅退出处理
 * 监听 SIGINT / SIGTERM 信号
 */
function setupGracefulShutdown(): void {
  const shutdown = (signal: string): void => {
    logger.info(`收到 ${signal} 信号，正在优雅退出...`);
    isRunning = false;
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

/**
 * 主流程：输入框检测 → 图片监控 → 下载
 *
 * @throws 任何不可恢复的错误
 */
async function main(): Promise<void> {
  logger.info("========== 屏幕自动化工具启动 ==========");
  printConfig();
  logger.info("=========================================");

  isRunning = true;
  setupGracefulShutdown();

  try {
    // ========== 阶段 1: 检测输入框 ==========
    logger.info("【阶段 1】检测屏幕中的输入框...");

    const { primaryInputBox } = await detectInputBox();

    if (!primaryInputBox) {
      logger.warn("未检测到输入框，请确认屏幕上是否有可见的输入框");
      logger.info("5 秒后重试检测...");

      // 等待后重试一次
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (!isRunning) {
        logger.info("用户中断，退出");
        return;
      }

      const retryResult = await detectInputBox();
      if (!retryResult.primaryInputBox) {
        logger.error("两次检测均未发现输入框，退出程序");
        return;
      }
    }

    logger.info("输入框检测完成，进入图片生成监控阶段");

    if (!isRunning) {
      logger.info("用户中断，退出");
      return;
    }

    // ========== 阶段 2: 监控图片生成 ==========
    logger.info("【阶段 2】开始监控图片生成状态...");

    const monitorResult: MonitorResult = await monitorImageGeneration(
      (progress: MonitorResult) => {
        logger.info(
          `监控进度: 第 ${progress.pollCount} 次轮询, ` +
          `图片${progress.imageGenerated ? "已" : "未"}生成`
        );
      }
    );

    logger.info(
      `图片生成监控完成: 图片位于 (${monitorResult.imagePosition?.x ?? "N/A"}, ${monitorResult.imagePosition?.y ?? "N/A"})`
    );

    if (!isRunning) {
      logger.info("用户中断，退出");
      return;
    }

    // ========== 阶段 3: 自动下载 ==========
    if (monitorResult.imagePosition) {
      logger.info("【阶段 3】开始自动下载流程...");

      const downloadPosition = monitorResult.kimiDetail?.downloadButtonPosition ?? monitorResult.imagePosition;

      logger.info(
        `下载目标: (${downloadPosition.x}, ${downloadPosition.y})` +
        (monitorResult.kimiDetail?.downloadButtonPosition ? " (下载按钮)" : " (图片位置)")
      );

      const success = await executeDownload(downloadPosition);

      if (success) {
        logger.info("========== 自动化流程完成！下载成功 ==========");
      } else {
        logger.error("========== 自动化流程结束：下载失败 ==========");
      }
    } else {
      logger.warn("图片位置未知，无法执行下载操作");
    }
  } catch (err: unknown) {
    logger.error(`自动化流程异常: ${String(err)}`);

    if (err instanceof Error && err.stack) {
      logger.error(`堆栈信息: ${err.stack}`);
    }

    process.exit(1);
  } finally {
    isRunning = false;
    logger.info("========== 屏幕自动化工具已停止 ==========");
  }
}

// 启动主流程
main().catch((err: unknown) => {
  logger.error(`未捕获异常: ${String(err)}`);
  process.exit(1);
});
