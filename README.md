# Eartraining_AutoEQ

<img src="assets/readme-badge.png" alt="Eartraining AutoEQ" width="600">

[![Check](https://github.com/yourpapayouknow/Eartraining_AutoEQ/actions/workflows/check.yml/badge.svg)](https://github.com/yourpapayouknow/Eartraining_AutoEQ/actions/workflows/check.yml)

为 [Eartraining](https://app.eartraining.cn/) 导入 AutoEQ 耳机校正的单文件用户脚本。界面只有导入按钮与 EQ 滑动开关，适合 iPad 触控；浏览器端运行，无运行时依赖。

**[安装脚本](https://raw.githubusercontent.com/yourpapayouknow/Eartraining_AutoEQ/main/eartraining-autoeq.user.js)** · **[下载发布版](https://github.com/yourpapayouknow/Eartraining_AutoEQ/releases/latest)** · [详细使用说明](使用说明.md)

## 安装

### Edge / Chrome

1. 安装并启用 [脚本猫](https://docs.scriptcat.org/docs/use/use/) 或其他兼容用户脚本的管理器。
2. 点击上面的“安装脚本”，在管理器页面确认安装并启用。若浏览器只显示源码，可在脚本猫中**新建普通脚本 → 粘贴完整源码 → Ctrl+S**。
3. 允许脚本管理器访问 `app.eartraining.cn`，刷新训练页面，右下角出现导入按钮和 EQ 开关。

### iPad Safari

1. 安装并启用 [Userscripts](https://github.com/quoid/userscripts)，确认应用使用的脚本文件夹。
2. 从发布页下载 `eartraining-autoeq.user.js`，放入该文件夹。
3. 在 Safari 中启用扩展并允许访问训练网站，打开一次扩展菜单识别脚本，再刷新页面。

## 导入校正

1. 在 [AutoEQ](https://autoeq.app/) 选择耳机，导出 **EqualizerAPO ParametricEq** 的 `.txt` 文件。
2. 在 **`app.eartraining.cn` 训练页**点“导入”，选择该文件。导入成功会自动开启 EQ。
3. 使用滑动开关旁路或恢复校正；网站开始播放训练音频后，校正会作用于输出。

支持含 `Preamp` 和 `PK` / `LSC` / `HSC` 的参数文本，最多 32 个启用滤波器、64 KiB。可选择 48 kHz 导出；脚本按网站实际音频采样率计算滤波器。CSV、GraphicEQ 文本和 WAV 脉冲响应需先转换为上述参数格式。

导入的文件内容和开关状态自动保存在当前网站的本机浏览器存储中，下次访问恢复；不会上传校正文件。主页与训练子域的存储相互独立，所以请在训练页导入。不同设备或浏览器不自动同步，清除网站数据后需要重新导入。

## 验证与开发

需要 Node.js 20+ 和已安装的 Microsoft Edge。Windows 使用 PowerShell 7：

```powershell
$env:npm_config_script_shell = 'pwsh.exe'
npm ci --ignore-scripts
npm run check
npm test
node node_modules/playwright/cli.js install webkit
npm run test:webkit
```

Edge 检查导入校验、滤波响应、实际旁路、连接与断开、多采样率、持久化及 320–1024px 布局。Windows WebKit 缺少 Web Audio，检查范围仅为界面、导入与状态恢复。

> [!NOTE]
> 自动化使用隔离测试页注入脚本，不能证明脚本管理器会自动安装或注入。iPad Safari 的扩展运行仍需真机验证。本脚本仅处理该网站的 Web Audio 输出。

## 实现依据

- 滤波系数移植自 [AutoEq 的 peq.py](https://github.com/jaakkopasanen/AutoEq/blob/7ae0f56d53074872b028649617a22bbb4232feb7/autoeq/peq.py)，保留其 MIT 声明与搁架 Q 参数。
- Safari 的脚本元数据和页面注入方式参考 [Userscripts](https://github.com/quoid/userscripts/tree/8b743e37dd7dfc8a510aff4e5e2ab8b1cc9210df)。
