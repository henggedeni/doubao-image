/**
 * 图片生成监控模块
 * 3 秒轮询循环，判断图片是否已生成
 * 使用 Kimi 作为唯一视觉识别模型
 */

import * as logger from "../utils/logger.js";
import { captureScreen, getScreenSize } from "../screen/capture.js";
import { analyzeWithKimi, analyzeWithKimiDetail } from "../ai/client.js";
import { retry } from "../utils/retry.js";
import { config } from "../config.js";
import type { ScreenAnalysis, ImageDetail, ImagePosition } from "../ai/schemas.js";

/** 监控用的 Kimi 提示词 */
const MONITOR_PROMPT = `你是一个屏幕监控助手。请观察这张屏幕截图，判断图片是否已生成。

具体要求：
1. 检查屏幕中是否有可见的生成图片（不是加载中的占位符，而是实际渲染出来的图片）
2. 如果图片已生成，返回图片在屏幕上的中心位置
3. 如果图片还在生成中或加载中，imageGenerated 设为 false
4. 同时列出屏幕中的输入框
5. 描述当前屏幕状态

判断标准：
- 图片已完全渲染，没有加载动画或进度条覆盖
- 图片内容可见且清晰
- 如果有"下载"按钮出现，说明图片已生成`;

/** Kimi 详细分析提示词 */
const KIMI_DETAIL_PROMPT = `请仔细分析这张屏幕截图中的图片生成状态：

1. 图片是否已完成生成？
2. 如果已完成，是否有下载按钮？下载按钮在屏幕上的哪个位置？
3. 如果图片仍在生成中，当前是什么状态？
4. 图片的 URL 是什么（如果能在屏幕上看到）？

请准确返回坐标和状态信息。`;

/** 监控结果接口 */
export interface MonitorResult {
  /** 图片是否已生成 */
  imageGenerated: boolean;
  /** 图片位置（可能为 null） */
  imagePosition: ImagePosition | null;
  /** Kimi 详细分析结果（可选） */
  kimiDetail?: ImageDetail;
  /** 屏幕分析结果 */
  analysis: ScreenAnalysis;
  /** 当前轮询次数 */
  pollCount: number;
}

/**
 * 单次轮询：截图 → Kimi 分析
 *
 * @returns 本轮分析结果
 */
async function pollOnce(): Promise<ScreenAnalysis> {
  const screenshotBase64 = await captureScreen();
  const screenSize = await getScreenSize();

  const analysis = await retry(
    () => analyzeWithKimi(screenshotBase64, MONITOR_PROMPT, "monitor"),
    {
      maxRetries: config.maxRetries,
      initialDelay: 2000,
      exponentialBackoff: true,
      retryable: (err: unknown) => {
        const msg = String(err);
        return (
          msg.includes("timeout") ||
          msg.includes("network") ||
          msg.includes("429") ||
          msg.includes("500") ||
          msg.includes("503")
        );
      },
    }
  );

  // 校验坐标
  if (analysis.imagePosition) {
    if (
      analysis.imagePosition.x < 0 ||
      analysis.imagePosition.y < 0 ||
      analysis.imagePosition.x > screenSize.width ||
      analysis.imagePosition.y > screenSize.height
    ) {
      logger.warn(`图片坐标超出屏幕范围，已忽略: (${analysis.imagePosition.x}, ${analysis.imagePosition.y})`);
      analysis.imagePosition = null;
      analysis.imageGenerated = false;
    }
  }

  return analysis;
}

/**
 * 使用 Kimi 做详细视觉分析
 * 当主分析判断需要更详细分析时调用
 *
 * @returns Kimi 详细分析结果
 */
async function detailedAnalysisWithKimi(): Promise<ImageDetail> {
  logger.info("需要更详细分析，交由 Kimi 详细模式处理...");

  const screenshotBase64 = await captureScreen();

  const result = await retry(
    () => analyzeWithKimiDetail(screenshotBase64, KIMI_DETAIL_PROMPT, "monitor_detail"),
    {
      maxRetries: config.maxRetries,
      initialDelay: 2000,
      exponentialBackoff: true,
      retryable: (err: unknown) => {
        const msg = String(err);
        return (
          msg.includes("timeout") ||
          msg.includes("network") ||
          msg.includes("429") ||
          msg.includes("500") ||
          msg.includes("503")
        );
      },
    }
  );

  return result;
}

/**
 * 开始图片生成监控循环
 * 每隔 pollInterval 毫秒截屏分析一次，直到图片生成或达到最大轮询次数
 *
 * @param onProgress - 每轮进度回调（可选）
 * @returns 最终监控结果
 * @throws 达到最大轮询次数仍未检测到图片时抛出异常
 */
export async function monitorImageGeneration(
  onProgress?: (result: MonitorResult) => void
): Promise<MonitorResult> {
  logger.info(
    `开始图片生成监控: 间隔=${config.pollInterval}ms, 最大轮询=${config.maxPollCount} 次`
  );

  let pollCount = 0;

  while (pollCount < config.maxPollCount) {
    pollCount++;
    logger.info(`第 ${pollCount}/${config.maxPollCount} 次轮询...`);

    try {
      const analysis = await pollOnce();

      const result: MonitorResult = {
        imageGenerated: analysis.imageGenerated,
        imagePosition: analysis.imagePosition,
        analysis,
        pollCount,
      };

      if (analysis.imageGenerated && analysis.imagePosition) {
        logger.info(
          `图片已生成！位置: (${analysis.imagePosition.x}, ${analysis.imagePosition.y})`
        );

        // Kimi 检测到图片，尝试用详细模式获取下载按钮位置
        try {
          const kimiDetail = await detailedAnalysisWithKimi();
          result.kimiDetail = kimiDetail;

          if (kimiDetail.downloadButtonPosition) {
            logger.info(
              `Kimi 检测到下载按钮: (${kimiDetail.downloadButtonPosition.x}, ${kimiDetail.downloadButtonPosition.y})`
            );
            result.imagePosition = kimiDetail.downloadButtonPosition;
          }
        } catch (detailError: unknown) {
          logger.warn(`Kimi 详细分析失败（不影响主流程）: ${String(detailError)}`);
        }

        onProgress?.(result);
        return result;
      }

      // Kimi 认为图片未生成但描述含糊，用详细模式再确认
      if (
        !analysis.imageGenerated &&
        (analysis.description.includes("加载") ||
          analysis.description.includes("生成中") ||
          analysis.description.includes("loading"))
      ) {
        try {
          const kimiDetail = await detailedAnalysisWithKimi();
          result.kimiDetail = kimiDetail;

          // 如果详细模式判断图片已生成且有下载按钮
          if (kimiDetail.downloadButtonPosition) {
            logger.info(
              `Kimi 详细模式检测到下载按钮: (${kimiDetail.downloadButtonPosition.x}, ${kimiDetail.downloadButtonPosition.y})`
            );
            result.imageGenerated = true;
            result.imagePosition = kimiDetail.downloadButtonPosition;
            onProgress?.(result);
            return result;
          }
        } catch (kimiError: unknown) {
          logger.warn(`Kimi 详细分析失败（不影响主流程）: ${String(kimiError)}`);
        }
      }

      logger.info(
        `图片尚未生成 (第 ${pollCount} 次): ${analysis.description}`
      );
      onProgress?.(result);

      // 等待轮询间隔
      if (pollCount < config.maxPollCount) {
        logger.info(`等待 ${config.pollInterval}ms 后继续轮询...`);
        await new Promise((resolve) => setTimeout(resolve, config.pollInterval));
      }
    } catch (err: unknown) {
      logger.error(`轮询异常 (第 ${pollCount} 次): ${String(err)}`);
      // 异常后等待更长时间再重试
      const errorDelay = config.pollInterval * 2;
      logger.info(`异常后等待 ${errorDelay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, errorDelay));
    }
  }

  throw new Error(
    `图片生成监控超时: 已轮询 ${config.maxPollCount} 次，图片仍未生成`
  );
}
