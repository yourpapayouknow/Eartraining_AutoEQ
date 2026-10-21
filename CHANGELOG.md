# 版本记录

## 1.0.2 — 2026-10-21

首个 GitHub 公开版本。

- 导入 AutoEQ 的 EqualizerAPO ParametricEq 文本，支持 Preamp、PK、LSC、HSC。
- 仅显示导入按钮与原生 EQ 滑动开关，支持窄屏触控。
- 将校正应用于 Eartraining 的实时 Web Audio 最终输出，支持旁路和训练音频重连。
- 在当前站点本机保存校正文件内容及开关状态，重新访问时恢复。
- 匹配 `eartraining.cn` 与 `app.eartraining.cn`。
- 提供 GitHub 安装与更新地址、固定版本的测试依赖和 GitHub Actions 检查。

验证范围：Edge 隔离页面中的音频与界面检查，Windows WebKit 的界面检查。未完成脚本管理器自动安装及 iPad Safari 真机自动化验证。
