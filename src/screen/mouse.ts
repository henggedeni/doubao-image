/**
 * 鼠标控制模块
 * 封装 @nut-tree-fork/nut-js 的鼠标移动和点击操作
 */

import { mouse, straightTo, Button, Point, linear } from "@nut-tree-fork/nut-js";
import * as logger from "../utils/logger.js";
import { getScreenSize } from "./capture.js";

/** 点击后延迟确认时间（毫秒） */
const CLICK_CONFIRM_DELAY_MS = 200;

/**
 * 校验坐标有效性
 * 坐标必须非负且不超出屏幕范围
 *
 * @param x - X 坐标
 * @param y - Y 坐标
 * @throws 坐标无效时抛出错误
 */
export async function validateCoordinates(x: number, y: number): Promise<void> {
  if (x < 0 || y < 0) {
    throw new Error(`坐标无效（不能为负数）: x=${x}, y=${y}`);
  }

  const screenSize = await getScreenSize();
  if (x > screenSize.width || y > screenSize.height) {
    throw new Error(
      `坐标超出屏幕范围: x=${x}, y=${y}, 屏幕尺寸=${screenSize.width}x${screenSize.height}`
    );
  }
}

/**
 * 移动鼠标到指定坐标
 * 带坐标校验，默认使用线性缓动函数实现平滑移动
 *
 * @param x - 目标 X 坐标
 * @param y - 目标 Y 坐标
 * @param smooth - 是否平滑移动（默认 true，使用 linear 缓动）
 * @throws 坐标无效时抛出错误
 */
export async function moveMouse(x: number, y: number, smooth: boolean = true): Promise<void> {
  await validateCoordinates(x, y);

  logger.info(`移动鼠标到: (${x}, ${y})${smooth ? " (平滑)" : " (直接)"}`);

  const target = new Point(x, y);

  if (smooth) {
    // mouse.move(path, easingFunction?) 第二个参数是 EasingFunction
    await mouse.move(await straightTo(target), linear);
  } else {
    await mouse.setPosition(target);
  }
}

/**
 * 在当前位置执行鼠标左键点击
 * 点击后添加短暂延迟确认
 *
 * @param button - 鼠标按键（默认左键）
 */
export async function clickMouse(button: Button = Button.LEFT): Promise<void> {
  logger.info(`鼠标点击: ${button === Button.LEFT ? "左键" : button === Button.RIGHT ? "右键" : "中键"}`);

  await mouse.click(button);

  // 点击后短暂延迟，确认操作生效
  await new Promise((resolve) => setTimeout(resolve, CLICK_CONFIRM_DELAY_MS));
}

/**
 * 移动鼠标到指定坐标并点击
 * 组合操作：移动 → 点击 → 延迟确认
 *
 * @param x - 目标 X 坐标
 * @param y - 目标 Y 坐标
 * @param smooth - 是否平滑移动（默认 true）
 * @throws 坐标无效时抛出错误
 */
export async function moveAndClick(
  x: number,
  y: number,
  smooth: boolean = true
): Promise<void> {
  await moveMouse(x, y, smooth);
  await clickMouse();
  logger.info(`已完成点击操作: (${x}, ${y})`);
}

/**
 * 双击指定坐标
 *
 * @param x - 目标 X 坐标
 * @param y - 目标 Y 坐标
 * @param smooth - 是否平滑移动（默认 true）
 */
export async function doubleClick(
  x: number,
  y: number,
  smooth: boolean = true
): Promise<void> {
  await moveMouse(x, y, smooth);
  await mouse.doubleClick(Button.LEFT);
  await new Promise((resolve) => setTimeout(resolve, CLICK_CONFIRM_DELAY_MS));
  logger.info(`已完成双击操作: (${x}, ${y})`);
}
