# 项目记忆

## 架构决策
- 图片识别模型：**Kimi**（moonshot-v1-vision-preview），不使用 DeepSeek（无图片识别能力）
- DeepSeek 相关配置、客户端、调用已全部移除
- Kimi 同时承担主分析（analyzeWithKimi → ScreenAnalysis）和详细分析（analyzeWithKimiDetail → ImageDetail）两个角色

## API 配置
- Kimi API：`KIMI_API_KEY`（必填）、`KIMI_BASE_URL`（默认 https://api.moonshot.cn/v1）、`KIMI_MODEL`（默认 moonshot-v1-vision-preview）
- 原 DeepSeek 环境变量（DEEPSEEK_API_KEY 等）已不再使用，可从 .env 中删除
