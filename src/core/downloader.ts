/**
 * 下载自动化模块
 * 接收图片/下载按钮坐标，移动鼠标点击触发下载
 * 使用 Kimi 验证下载状态
 */

import * as logger from "../utils/logger.js";
import { moveAndClick, validateCoordinates } from "../screen/mouse.js";
import { captureScreen } from "../screen/capture.js";
import { analyzeWithKimi } from "../ai/client.js";
import { retry } from "../utils/retry.js";
import { config } from "../config.js";
import type { ImagePosition } from "../ai/schemas.js";

/** 下载验证提示词 */
const VERIFY_DOWNLOAD_PROMPT = `请观察这张屏幕截图，判断下载操作是否已触发。

检查以下内容：
1. 是否出现了"另存为"或"保存"对话框？
2. 是否有下载进度条或下载提示？
3. 页面状态是否有变化（如弹窗出现）？

描述你看到的屏幕状态。`;

/** 下载验证结果接口 */
export interface DownloadVerification {
  /** 下载是否已触发 */
  downloadTriggered: boolean;
  /** 屏幕状态描述 */
  description: string;
}

/**
 * 触发下载操作
 * 移动鼠标到目标坐标并点击
 *
 * @param position - 目标位置（图片或下载按钮的中心坐标）
 * @throws 坐标无效或点击失败时抛出异常
 */
export async function triggerDownload(position: ImagePosition): Promise<void> {
  logger.info(`准备触发下载: 目标坐标 (${position.x}, ${position.y})`);

  // 校验坐标
  await validateCoordinates(position.x, position.y);

  // 移动鼠标并点击
  await retry(
    () => moveAndClick(position.x, position.y),
    {
      maxRetries: config.maxRetries,
      initialDelay: 1000,
      retryable: (err: unknown) => {
        const msg = String(err);
        return msg.includes("move") || msg.includes("click") || msg.includes("mouse");
      },
    }
  );

  logger.info("下载点击操作已完成");
}

/**
 * 验证点击后状态
 * 截屏检查是否触发了下载对话框或保存提示
 *
 * @returns 验证结果
 */
export async function verifyDownload(): Promise<DownloadVerification> {
  logger.info("正在验证下载状态...");

  try {
    // 等待短暂时间让 UI 响应
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const screenshotBase64 = await captureScreen();

    const analysis = await analyzeWithKimi(
      screenshotBase64,
      VERIFY_DOWNLOAD_PROMPT,
      "download"
    );

    const downloadTriggered =
      analysis.description.includes("另存为") ||
      analysis.description.includes("保存") ||
      analysis.description.includes("下载") ||
      analysis.description.includes("弹窗") ||
      analysis.description.includes("对话框");

    logger.info(
      `下载验证: ${downloadTriggered ? "下载已触发" : "未检测到下载"} - ${analysis.description}`
    );

    return {
      downloadTriggered,
      description: analysis.description,
    };
  } catch (err: unknown) {
    logger.warn(`下载验证失败（不影响主流程）: ${String(err)}`);
    return {
      downloadTriggered: false,
      description: `验证失败: ${String(err)}`,
    };
  }
}

/**
 * 完整的下载流程
 * 点击触发 → 等待 → 验证 → 必要时重试
 *
 * @param position - 下载目标位置
 * @returns 下载是否成功
 */
export async function executeDownload(position: ImagePosition): Promise<boolean> {
  logger.info("===== 开始执行下载流程 =====");

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      logger.info(`下载尝试 ${attempt}/${config.maxRetries}`);

      // 触发下载
      await triggerDownload(position);

      // 验证结果
      const verification = await verifyDownload();

      if (verification.downloadTriggered) {
        logger.info("下载流程成功完成！");
        return true;
      }

      logger.warn(`下载验证未通过 (尝试 ${attempt}): ${verification.description}`);

      if (attempt < config.maxRetries) {
        const delay = 2000 * attempt;
        logger.info(`${delay}ms 后重试下载...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (err: unknown) {
      logger.error(`下载流程异常 (尝试 ${attempt}): ${String(err)}`);

      if (attempt < config.maxRetries) {
        const delay = 2000 * attempt;
        logger.info(`${delay}ms 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error("下载流程失败：所有重试已耗尽");
  return false;
}
