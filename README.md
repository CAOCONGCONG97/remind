# remind — Win11 强制休息提醒

离线托盘常驻桌面应用：到达设定工作时长后，在**所有显示器**上全屏遮罩强制休息；可选每日自动关机。无网络、无账号，界面仅中文。

技术栈：**Electron + TypeScript**（electron-vite）。

## 功能

- **触发模式**：固定间隔，或累计会话时长（锁屏 / 睡眠 / 休眠暂停累计）
- **强制遮罩**：多显示器全屏置顶 + 倒计时；结束后须点「继续工作」；休息中轮换放松提示
- **休息前提醒**：到期前右下角轻提醒（默认可配提前 2 分钟）；可密码延长本段 15/30 分钟
- **本段再延长**：托盘菜单确认延长当前工作段
- **托盘状态**：悬停/菜单显示距下次休息或休息剩余
- **紧急跳过**：同一套本地紧急密码可跳过休息 / 取消关机（无每日次数限制）
- **首次运行**：强制非空紧急密码 + 三步引导（模式 / 时长 / 是否关机）
- **托盘**：设置…、立即休息、本段再延长、关于、退出
- **开机自启**：默认开启（可在设置关闭）
- **可选自动关机**：每日定时；右下角提前提醒；可取消（仅本次/当天）或推迟 15/30 分钟

## 环境要求

- **Windows 11**（目标平台；其它系统可开发/跑单测，但关机与自启为 stub 或受限）
- Node.js **20+**（开发与打包）

## 安装依赖

```bash
cd remind
npm install
```

## 开发运行

```bash
npm run dev
```

首次启动会弹出「设置紧急密码」窗口；设好后托盘出现图标（注意 Win11 托盘溢出区）。

## 测试

```bash
npm test
```

核心休息引擎与密码哈希为纯 TS，可在任意平台跑通。

## 打包（Windows 安装包）

在仓库根目录（需 Windows + Node 20+）：

```bash
npm install
npm run pack:win
```

`pack:win` = `electron-vite build` + `electron-builder --win --x64`。

### 产物（`release/`）

| 文件 | 说明 |
|------|------|
| `remind-0.1.0-setup.exe` | **NSIS 安装程序**（可双击安装，可选目录、桌面/开始菜单快捷方式） |
| `remind-0.1.0-portable.exe` | 便携版（解压即用，不写安装向导） |

国内若下载 electron-builder 二进制慢，可先设：

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'   # 跳过代码签名
npm run pack:win
```

### 安装与已知限制

1. 双击 `remind-*-setup.exe` → 选安装目录 → 完成。
2. **未做代码签名**：SmartScreen / 杀软可能提示「未知发布者」，选「仍要运行 / 更多信息」即可。
3. 首次启动仍会要求设置紧急密码，然后出现系统托盘图标（注意 Win11 托盘溢出区）。

## 紧急密码

- **首次**：强制非空，不可跳过
- **修改**：托盘 → 设置… → 填写「紧急密码」与确认（留空表示不改）
- 用途：休息遮罩「紧急退出」、关机提醒「取消关机」
- 说明：仅本地 scrypt 哈希校验，防「一时手痒」，**不是**防专业破解

## 托盘用法

| 菜单 | 作用 |
|------|------|
| 设置… | 改触发模式、时长、密码、自启、关机 |
| 立即休息 | 立刻进入全屏休息倒计时 |
| 关于 | 版本与已知限制 |
| 退出 | 结束进程 |

## 默认建议值（可改）

| 项 | 默认 |
|----|------|
| 触发模式 | 固定间隔 |
| 工作间隔 | 60 分钟 |
| 休息时长 | 5 分钟 |
| 开机自启 | 开 |
| 每日自动关机 | 关 |
| 关机时刻 | 23:30 |
| 关机前提醒 | 提前 5 分钟 |

## Win11 能力边界（诚实说明）

- 遮罩使用置顶窗口覆盖普通应用；**无法**盖住 UAC / 安全桌面。
- 部分**独占全屏游戏**或其它更高 TopMost 窗口可能压过遮罩。
- 锁屏 / 睡眠依赖 Electron `powerMonitor`（`lock-screen` / `suspend` 等）；快速用户切换等边界需自行留意。
- 关机调用 `shutdown /s /t 0 /f`；取消须在真正执行前完成（本应用在到点前用密码取消）。
- 开机自启写入 `HKCU\...\Run`（值名 `RemindForcedRest`）并调用 `app.setLoginItemSettings`；**请使用 setup 安装版**。便携版解压在 Temp，旧逻辑会把自启指到临时目录，重启后失效。
- Win11 若仍不自启：打开「设置 → 应用 → 启动」，确认「强制休息提醒 / RemindForcedRest」为开。

## 许可

Apache License 2.0 — 见 `LICENSE`。

## 仓库

https://github.com/CAOCONGCONG97/remind
