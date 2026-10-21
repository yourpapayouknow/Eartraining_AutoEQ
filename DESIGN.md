---
name: Eartraining AutoEQ
version: alpha
colors:
  primary: "#673AB7"
  surface: "#FFFFFF"
  on-surface: "#212121"
  error: "#B3261E"
typography:
  body:
    fontFamily: inherit
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  panel: 12px
  control: 8px
  pill: 9999px
spacing:
  small: 8px
  normal: 16px
components:
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    padding: "{spacing.normal}"
  button:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: 44px
---

## Overview

为 app.eartraining.cn 提供适合 iPad 触控的轻量耳机校正面板，沿用网站风格。用户已确认：越简单越好，只需要导入和开关。

## Colors

优先继承 Vuetify 的主题变量：primary、surface、on-surface 和 error，跟随网站明暗主题。上述紫色、白色和深灰色是主题变量不可用时的后备值。开关通过滑块位置区分状态，配合原生勾选状态与屏幕阅读器通知，不依赖颜色。

## Typography

继承训练网站字体；导入与 EQ 标签为 16px，行高 1.5。不加载字体资源。

## Layout

右下角始终显示一条紧凑控件栏，宽不超过 200px、高不超过 56px。仅包含导入按钮和 EQ 滑动开关，取消折叠面板。边距 16px、控件间距 8px、内边距 4px 8px，兼顾 iPad 横竖屏、分屏和安全区。

## Elevation & Depth

细边框加轻阴影（0 4px 16px、黑色 18%），使面板与训练页面区分。只在面板局部拦截触控，不使用遮罩。

## Shapes

控件栏 12px 圆角，导入按钮 8px 圆角。滑动开关轨道为 52×32px 胶囊形、滑块为 26px 圆形。所有触控目标至少 44px 高。

## Components

使用导入按钮、隐藏的原生文件选择器及原生 checkbox（role=switch）构成滑动开关。可见文字只有“导入”和“EQ”。文件名放在导入按钮 title 中，状态仅通过屏幕阅读器通知；错误仅在发生时弹出。仅支持 AutoEQ 参数 EQ 文本；不添加参数编辑、曲线、前级调节或滤波器列表。

## Do's and Don'ts

- 保持训练区域可用，控件直接可用，开关位置明确表示状态。
- 不显示常驻说明、文件名、状态段落或额外展开按钮。
- 导入失败保留旧配置；记忆校正文件和开关状态，文件留在本机。
- 使用可聚焦的原生控件，保留明显焦点轮廓，状态变化通过 aria-live 通知。
- 不制作参数编辑、图表、动画、遮罩或额外音量调节。
