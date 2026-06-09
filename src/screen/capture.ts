/**
 * 屏幕截图模块
 * 使用 @nut-tree-fork/nut-js 截取屏幕，sharp 转换压缩为 base64
 *
 * API 说明：
 * - screen.grab() → Promise<Image>  直接获取 Image 对象（推荐）
 * - screen.capture(fileName) → Promise<string>  保存到文件并返回路径
 * - Image.data 是 BGR 格式的原始像素数据（nut.js 默认色彩模式）
 */

import { screen } from "@nut-tree-fork/nut-js";
import type { Image } from "@nut-tree-fork/shared";
import sharp from "sharp";
import * as logger from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { config } from "../config.js";

/** 截图区域接口 */
export interface CaptureRegion {
  /** 左上角 X 坐标 */
  x: number;
  /** 左上角 Y 坐标 */
  y: number;
  /** 区域宽度 */
  width: number;
  /** 区域高度 */
  height: number;
}

/**
 * 将 nut.js Image 对象转为 base64 JPEG 字符串
 * nut.js 的 Image 默认是 BGR 格式，需转为 RGB 再编码为 JPEG
 *
 * @param img - nut.js 返回的 Image 对象
 * @param maxWidth - 最大宽度（默认使用配置值）
 * @param quality - JPEG 质量（默认使用配置值）
 * @returns base64 编码的 JPEG 字符串
 */
async function imageToBase64(
  img: Image,
  maxWidth: number = config.screenshotMaxWidth,
  quality: number = config.screenshotQuality
): Promise<string> {
  // nut.js 默认 BGR 格式，使用 sharp 的 raw 输入需要指定正确通道数
  const channels = img.hasAlphaChannel ? 4 : 3;

  let pipeline = sharp(img.data, {
    raw: {
      width: img.width,
      height: img.height,
      channels,
    },
  });

  // 如果图片宽度超过最大宽度，等比缩放
  if (img.width > maxWidth) {
    pipeline = pipeline.resize(maxWidth);
    logger.info(`截图缩放: ${img.width}px -> ${maxWidth}px`);
  }

  // 转换为 JPEG 并设置质量
  const jpegBuffer = await pipeline
    .jpeg({ quality })
    .toBuffer();

  const base64 = jpegBuffer.toString("base64");
  const sizeKB = Math.round(jpegBuffer.length / 1024);
  logger.info(`截图转换完成: ${sizeKB}KB (base64 长度: ${base64.length})`);

  return base64;
}

/**
 * 截取全屏并返回 base64 编码的 JPEG
 * 使用 screen.grab() 获取 Image 对象，无需保存到文件
 *
 * @returns base64 编码的截图字符串
 * @throws 截图失败且重试耗尽时抛出异常
 */
export async function captureScreen(): Promise<string> {
  logger.info("正在截取全屏...");

  const img = await retry(
    async () => {
      const image = await screen.grab();
      if (!image || !image.data || image.width <= 0 || image.height <= 0) {
        throw new Error("nut.js 截图返回无效数据");
      }
      return image;
    },
    {
      maxRetries: config.maxRetries,
      initialDelay: 500,
      retryable: (err: unknown) => {
        const msg = String(err);
        return msg.includes("grab") || msg.includes("screen") || msg.includes("permission");
      },
    }
  );

  const base64 = await imageToBase64(img);
  logger.info("全屏截图完成");
  return base64;
}

/**
 * 截取指定区域并返回 base64 编码的 JPEG
 * 先截取全屏再裁剪，避免 nut.js 区域截图的兼容性问题
 *
 * @param region - 截图区域
 * @returns base64 编码的截图字符串
 * @throws 截图失败或区域无效时抛出异常
 */
export async function captureRegion(region: CaptureRegion): Promise<string> {
  if (region.width <= 0 || region.height <= 0) {
    throw new Error(`截图区域无效: width=${region.width}, height=${region.height}`);
  }

  logger.info(`正在截取区域: (${region.x}, ${region.y}) ${region.width}x${region.height}`);

  const img = await retry(
    async () => {
      const image = await screen.grab();
      if (!image || !image.data || image.width <= 0 || image.height <= 0) {
        throw new Error("nut.js 截图返回无效数据");
      }
      return image;
    },
    {
      maxRetries: config.maxRetries,
      initialDelay: 500,
    }
  );

  // 先从 BGR raw 转为 PNG，再用 sharp 裁剪
  const channels = img.hasAlphaChannel ? 4 : 3;
  const fullPngBuffer = await sharp(img.data, {
    raw: {
      width: img.width,
      height: img.height,
      channels,
    },
  })
    .png()
    .toBuffer();

  // 使用 sharp 裁剪指定区域
  const croppedBuffer = await sharp(fullPngBuffer)
    .extract({
      left: region.x,
      top: region.y,
      width: region.width,
      height: region.height,
    })
    .jpeg({ quality: config.screenshotQuality })
    .toBuffer();

  const base64 = croppedBuffer.toString("base64");
  const sizeKB = Math.round(croppedBuffer.length / 1024);
  logger.info(`区域截图完成: ${sizeKB}KB`);

  return base64;
}

/**
 * 获取屏幕尺寸
 * 注意：返回的是逻辑分辨率，Retina 屏幕实际像素可能更高
 * @returns 屏幕宽高（逻辑分辨率）
 */
export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const screenWidth = await screen.width();
  const screenHeight = await screen.height();
  return { width: screenWidth, height: screenHeight };
}
