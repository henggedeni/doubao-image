/**
 * LangChain AI 客户端模块
 * 使用 Kimi K2.5 作为主模型（支持图片识别）
 *
 * 设计要点：
 * - 使用 ChatOpenAI 统一接口，通过不同 baseURL 切换模型
 * - withStructuredOutput + Zod 确保返回结构化数据
 * - 统一错误处理和超时控制
 */

import { ChatOpenAI } from "@langchain/openai";
import type { Runnable } from "@langchain/core/runnables";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { config } from "../config.js";
import { ScreenAnalysisSchema, type ScreenAnalysis, ImageDetailSchema, type ImageDetail } from "./schemas.js";
import * as logger from "../utils/logger.js";

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/** Kimi 屏幕分析结构化输出客户端 */
let kimiScreenClient: Runnable<BaseLanguageModelInput, ScreenAnalysis> | null = null;

/** Kimi 图片详情结构化输出客户端 */
let kimiDetailClient: Runnable<BaseLanguageModelInput, ImageDetail> | null = null;

/**
 * 获取 Kimi 屏幕分析结构化输出客户端
 * 单例模式，避免重复创建
 *
 * @returns 配置好的 Kimi 结构化输出 Runnable
 */
export function getKimiScreenClient(): Runnable<BaseLanguageModelInput, ScreenAnalysis> {
  if (kimiScreenClient) {
    return kimiScreenClient;
  }

  logger.info(`初始化 Kimi 屏幕分析客户端: ${config.kimiBaseUrl} / ${config.kimiModel}`);

  const baseClient = new ChatOpenAI({
    modelName: config.kimiModel,
    openAIApiKey: config.kimiApiKey,
    temperature: 0,
    timeout: config.aiTimeout,
    configuration: {
      baseURL: config.kimiBaseUrl,
    },
  });

  kimiScreenClient = baseClient.withStructuredOutput<ScreenAnalysis>(ScreenAnalysisSchema, {
    name: "screen_analysis",
  });

  return kimiScreenClient;
}

/**
 * 获取 Kimi 图片详情结构化输出客户端
 * 单例模式，避免重复创建
 *
 * @returns 配置好的 Kimi 结构化输出 Runnable
 */
export function getKimiDetailClient(): Runnable<BaseLanguageModelInput, ImageDetail> {
  if (kimiDetailClient) {
    return kimiDetailClient;
  }

  logger.info(`初始化 Kimi 图片详情客户端: ${config.kimiBaseUrl} / ${config.kimiModel}`);

  const baseClient = new ChatOpenAI({
    modelName: config.kimiModel,
    openAIApiKey: config.kimiApiKey,
    temperature: 0,
    timeout: config.aiTimeout,
    configuration: {
      baseURL: config.kimiBaseUrl,
    },
  });

  kimiDetailClient = baseClient.withStructuredOutput<ImageDetail>(ImageDetailSchema, {
    name: "image_detail",
  });

  return kimiDetailClient;
}

/**
 * 将 base64 截图保存到本地文件
 * 文件命名格式: {prefix}_{tag}_{yyyyMMddTHHmmssSSS}.jpg
 *
 * @param imageBase64 - base64 编码的图片数据
 * @param tag - 调用场景标签（如 "monitor", "download", "detect", "detail"）
 */
async function saveScreenshotLocally(imageBase64: string, tag: string): Promise<void> {
  const dir = config.screenshotSaveDir;
  if (!dir) {
    return;
  }

  try {
    await mkdir(dir, { recursive: true });

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      "T",
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
      pad(now.getMilliseconds()).padStart(3, "0"),
    ].join("");

    const filename = `${config.screenshotSavePrefix}_${tag}_${ts}.jpg`;
    const filepath = join(dir, filename);

    const buffer = Buffer.from(imageBase64, "base64");
    await writeFile(filepath, buffer);

    const sizeKB = Math.round(buffer.length / 1024);
    logger.info(`截图已保存到本地: ${filepath} (${sizeKB}KB)`);
  } catch (err: unknown) {
    // 保存失败不阻塞主流程
    logger.warn(`截图保存到本地失败（不影响主流程）: ${String(err)}`);
  }
}

/**
 * 使用 Kimi 分析屏幕截图
 * 返回结构化的屏幕分析结果（输入框检测、图片位置等）
 *
 * @param imageBase64 - base64 编码的截图数据
 * @param prompt - 分析提示词
 * @param saveTag - 本地保存标签（如 "monitor", "download", "detect"），不传则用 "screen"
 * @returns 屏幕分析结果（已通过 Zod 校验）
 * @throws AI 调用失败或超时时抛出异常
 */
export async function analyzeWithKimi(
  imageBase64: string,
  prompt: string,
  saveTag?: string
): Promise<ScreenAnalysis> {
  const client = getKimiScreenClient();

  // 保存截图到本地
  await saveScreenshotLocally(imageBase64, saveTag ?? "screen");

  logger.info("调用 Kimi 分析屏幕截图...");

  const result = await client.invoke([
    {
      role: "user" as const,
      content: [
        {
          type: "image_url" as const,
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        },
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    },
  ]);

  logger.info(`Kimi 屏幕分析完成: ${result.description}`);
  return result;
}

/**
 * 使用 Kimi 做详细视觉分析
 * 返回结构化的图片详情
 *
 * @param imageBase64 - base64 编码的截图数据
 * @param prompt - 分析提示词
 * @param saveTag - 本地保存标签，不传则用 "detail"
 * @returns 图片详情分析结果（已通过 Zod 校验）
 * @throws AI 调用失败或超时时抛出异常
 */
export async function analyzeWithKimiDetail(
  imageBase64: string,
  prompt: string,
  saveTag?: string
): Promise<ImageDetail> {
  const client = getKimiDetailClient();

  // 保存截图到本地
  await saveScreenshotLocally(imageBase64, saveTag ?? "detail");

  logger.info("调用 Kimi 做详细视觉分析...");

  const result = await client.invoke([
    {
      role: "user" as const,
      content: [
        {
          type: "image_url" as const,
          image_url: {
            url: `data:image/jpeg;base64,${imageBase64}`,
          },
        },
        {
          type: "text" as const,
          text: prompt,
        },
      ],
    },
  ]);

  logger.info(`Kimi 详细分析完成: 状态=${result.imageStatus}`);
  return result;
}
