/**
 * Zod Schema 定义模块
 * 定义 AI 返回结果的类型安全结构
 */
import { z } from "zod";

/** 输入框坐标 Schema */
export const InputBoxSchema = z.object({
  /** 输入框中心 X 坐标 */
  x: z.number().min(0).describe("输入框中心 X 坐标"),
  /** 输入框中心 Y 坐标 */
  y: z.number().min(0).describe("输入框中心 Y 坐标"),
  /** 输入框宽度 */
  width: z.number().min(0).describe("输入框宽度（像素）"),
  /** 输入框高度 */
  height: z.number().min(0).describe("输入框高度（像素）"),
  /** 识别置信度 (0-1) */
  confidence: z.number().min(0).max(1).describe("识别置信度 (0-1)"),
});

/** 输入框坐标类型 */
export type InputBox = z.infer<typeof InputBoxSchema>;

/** 图片位置 Schema */
export const ImagePositionSchema = z.object({
  /** 图片中心 X 坐标 */
  x: z.number().min(0).describe("图片中心 X 坐标"),
  /** 图片中心 Y 坐标 */
  y: z.number().min(0).describe("图片中心 Y 坐标"),
});

/** 图片位置类型 */
export type ImagePosition = z.infer<typeof ImagePositionSchema>;

/** 屏幕分析结果 Schema - Kimi 主模型使用 */
export const ScreenAnalysisSchema = z.object({
  /** 识别到的输入框列表 */
  inputBoxes: z.array(InputBoxSchema).describe("识别到的输入框列表"),
  /** 图片是否已生成 */
  imageGenerated: z.boolean().describe("图片是否已生成"),
  /** 图片位置（仅当 imageGenerated 为 true 时有值） */
  imagePosition: ImagePositionSchema.nullable().describe("图片位置坐标，未生成时为 null"),
  /** 屏幕描述 */
  description: z.string().describe("对当前屏幕内容的简要描述"),
});

/** 屏幕分析结果类型 */
export type ScreenAnalysis = z.infer<typeof ScreenAnalysisSchema>;

/** 图片详情 Schema - Kimi 辅助模型使用 */
export const ImageDetailSchema = z.object({
  /** 图片 URL（如果能识别到） */
  imageUrl: z.string().nullable().describe("图片 URL，无法识别时为 null"),
  /** 下载按钮位置（如果能识别到） */
  downloadButtonPosition: ImagePositionSchema.nullable().describe("下载按钮位置坐标，无法识别时为 null"),
  /** 图片状态描述 */
  imageStatus: z.string().describe("图片当前状态描述（如：生成中/已完成/加载中等）"),
});

/** 图片详情类型 */
export type ImageDetail = z.infer<typeof ImageDetailSchema>;
