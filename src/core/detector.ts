/**
 * 输入框检测模块
 * 截屏 → Kimi 分析 → 返回输入框坐标
 */

import * as logger from "../utils/logger.js";
import { captureScreen, getScreenSize } from "../screen/capture.js";
import { analyzeWithKimi } from "../ai/client.js";
import { retry } from "../utils/retry.js";
import { config } from "../config.js";
import type { InputBox, ScreenAnalysis } from "../ai/schemas.js";

/** Kimi 输入框识别提示词 */
const DETECT_INPUT_BOX_PROMPT = `你是一个屏幕分析助手。请仔细观察这张屏幕截图，找出其中的文本输入框（input/text field）。

请完成以下任务：
1. 识别屏幕中所有的文本输入框，返回每个输入框的中心坐标 (x, y)、宽度、高度和置信度
2. 判断是否有图片已生成（如果屏幕中有可见的生成图片）
3. 如果有图片，返回图片的中心位置
4. 描述当前屏幕的主要内容

注意事项：
- 坐标基于屏幕左上角为原点
- 输入框通常有边框或下划线，背景色与周围不同
- 置信度范围 0-1，1 表示非常确定
- 优先识别最大的、最明显的输入框`;

/**
 * 从多个输入框中选择主输入框
 * 优先选择面积最大的，面积相同时选择更靠上的
 *
 * @param inputBoxes - 识别到的输入框列表
 * @returns 主输入框，或 null
 */
export function selectPrimaryInputBox(inputBoxes: InputBox[]): InputBox | null {
  if (inputBoxes.length === 0) {
    return null;
  }

  if (inputBoxes.length === 1) {
    return inputBoxes[0]!;
  }

  // 按面积降序，面积相同按 y 坐标升序（更靠上优先）
  const sorted = [...inputBoxes].sort((a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    if (areaA !== areaB) {
      return areaB - areaA;
    }
    return a.y - b.y;
  });

  logger.info(
    `识别到 ${inputBoxes.length} 个输入框，选择主输入框: ` +
    `(${sorted[0]!.x}, ${sorted[0]!.y}) 置信度=${sorted[0]!.confidence.toFixed(2)}`
  );

  return sorted[0]!;
}

/**
 * 使用 Kimi 检测屏幕中的输入框
 * 包含截屏、AI 分析、坐标校验的完整流程
 *
 * @returns 检测结果，包含主输入框坐标和屏幕分析
 * @throws AI 调用失败或重试耗尽时抛出异常
 */
export async function detectInputBox(): Promise<{
  primaryInputBox: InputBox | null;
  analysis: ScreenAnalysis;
}> {
  logger.info("开始检测输入框...");

  // 截取屏幕
  const screenshotBase64 = await captureScreen();

  // 获取屏幕尺寸用于校验
  const screenSize = await getScreenSize();

  // 调用 Kimi 分析
  const analysis = await retry(
    () => analyzeWithKimi(screenshotBase64, DETECT_INPUT_BOX_PROMPT, "detect"),
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

  logger.info(`屏幕分析: 识别到 ${analysis.inputBoxes.length} 个输入框, 图片${analysis.imageGenerated ? "已" : "未"}生成`);
  logger.info(`屏幕描述: ${analysis.description}`);

  // 校验返回的坐标是否在屏幕范围内
  const validInputBoxes = analysis.inputBoxes.filter((box) => {
    const isValid =
      box.x >= 0 &&
      box.y >= 0 &&
      box.x <= screenSize.width &&
      box.y <= screenSize.height;
    if (!isValid) {
      logger.warn(`输入框坐标超出屏幕范围，已忽略: (${box.x}, ${box.y})`);
    }
    return isValid;
  });

  // 选择主输入框
  const primaryInputBox = selectPrimaryInputBox(validInputBoxes);

  if (primaryInputBox) {
    logger.info(
      `主输入框: (${primaryInputBox.x}, ${primaryInputBox.y}), ` +
      `尺寸=${primaryInputBox.width}x${primaryInputBox.height}, ` +
      `置信度=${primaryInputBox.confidence.toFixed(2)}`
    );
  } else {
    logger.warn("未能识别到任何输入框");
  }

  return {
    primaryInputBox,
    analysis: { ...analysis, inputBoxes: validInputBoxes },
  };
}
