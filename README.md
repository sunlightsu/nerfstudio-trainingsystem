[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

# 🧊 Nerfstudio GUI

**A Web-based control panel for [Nerfstudio](https://docs.nerf.studio/).**
Configure pipelines step-by-step in your browser — no more typing long CLI commands by hand.

*[中文介绍 →](#中文介绍)*

---

## ✨ Features

| Tab | What it does |
|-----|-------------|
| 📷 **Process** | Run `ns-process-data` (images / video) with all camera model, SfM tool, and COLMAP options |
| 🚂 **Train** | Full support for **nerfacto** & **splatfacto**. VRAM presets (6/8/12 GB). Parameters are automatically isolated per method — no NeRF params leaking into 3DGS |
| 📦 **Export** | 6 export methods (poisson / tsdf / pointcloud / gaussian-splat / marching-cubes / cameras), each with its own parameter group |
| 📁 **Browse** | Explore your local filesystem right in the browser. Bookmark folders with one click |
| 💻 **Command Preview** | Fill in the left panel → see the assembled CLI command on the right. Edit it directly before execution |
| 📌 **Path Bookmarks** | Save frequently-used paths and reuse them across all tabs |

![Screenshot](display.png)

---

## 🚀 Quick Start

### Prerequisites

- Windows (Linux/macOS: just tweak `start.bat`)
- [Miniconda](https://docs.conda.io/en/latest/miniconda.html) or Anaconda
- A conda environment with [Nerfstudio](https://docs.nerf.studio/quickstart/installation.html) installed (default name `nerfstudio`)
- Python 3.10+

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/nerfstudio-gui.git
cd nerfstudio-gui
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### Run

```bash
.venv\Scripts\python.exe app.py
```

Open `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

---

## 🧱 Project Structure

```
nerfstudio-gui/
├── app.py                        # FastAPI backend — routes, models, cmd builders, SSE
├── requirements.txt              # Python dependencies
├── start.bat                     # One-click launcher
├── saved_paths.json              # Persisted path bookmarks
├── templates/
│   ├── index.html                # Two-column layout
│   ├── terminal.html             # Terminal output + command preview
│   └── steps/
│       ├── step1_process.html    # Preprocessing form
│       ├── step2_train.html      # Training form (nerfacto / splatfacto)
│       ├── step3_export.html     # Export form
│       └── step4_browse.html     # File browser + bookmark manager
├── static/
│   ├── style.css                 # Dark theme
│   └── app.js                    # Frontend logic
└── --help文档/                   # CLI reference docs
```

---

## 🔧 Architecture

```
Browser → POST JSON → FastAPI
  → Pydantic validation → build_*_cmd()
  → async subprocess (conda activate + ns-*)
  → SSE stream → Browser terminal (real-time)
```

- **Method-aware params** — `build_train_cmd` branches on `r.method` to isolate NeRF vs 3DGS
- **RAF terminal** — `requestAnimationFrame` batches DOM writes to prevent freeze during training
- **Class-based visibility** — `.hidden` + `classList`, no inline style pollution
- **`PYTHONIOENCODING=utf-8`** — fixes Windows GBK/emoji crash

---

## 📄 License

MIT. Acknowledgments: [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio), [FastAPI](https://fastapi.tiangolo.com/).

---

## 中文介绍

## 🧊 Nerfstudio GUI

一个基于 Web 的 Nerfstudio 操作面板，分步可视化操控命令行。

| 模块 | 说明 |
|------|------|
| 📷 图像预处理 | `ns-process-data` 在线配置 |
| 🚂 训练 | nerfacto / splatfacto，显存预设，参数自动隔离 |
| 📦 导出 | 6 种导出方式，各方式专属参数 |
| 📁 文件浏览 | 网页内浏览文件夹，一键书签 |
| 💻 命令预览 | 填参数 → 实时显示命令行，可直接编辑 |
| 📌 路径书签 | 常用路径一键填入 |

```bash
git clone https://github.com/YOUR_USERNAME/nerfstudio-gui.git
cd nerfstudio-gui && python -m venv .venv
.venv\Scripts\activate && pip install -r requirements.txt
python app.py  # → http://localhost:8000
```

---

## ✨ 功能

| 模块 | 说明 |
|------|------|
| 📷 **图像预处理** | 一键执行 `ns-process-data`（images / video），在线配置相机模型、SfM 工具、COLMAP 参数 |
| 🚂 **训练** | **nerfacto** 和 **splatfacto** 全覆盖，显存预设（6GB / 8GB / 12GB+），参数按方法自动隔离，不会把 NeRF 参数传给 3DGS |
| 📦 **导出** | 6 种导出方式（poisson / tsdf / pointcloud / gaussian-splat / marching-cubes / cameras），各方式专属参数 |
| 📁 **文件浏览** | 直接在网页里浏览电脑文件夹，一键保存路径为书签 |
| 💻 **命令预览** | 左侧填参数 → 右侧实时显示拼接好的命令行，可以直接编辑后再执行 |
| 📌 **路径书签** | 常用路径一键填入，不用反复复制粘贴 |

---

## 🚀 快速开始

### 环境要求

- Windows（Linux/Mac 可改 `start.bat`）
- [Miniconda](https://docs.conda.io/en/latest/miniconda.html) 或 Anaconda
- 已安装 [Nerfstudio](https://docs.nerf.studio/quickstart/installation.html) 的 conda 环境（默认环境名 `nerfstudio`）
- Python 3.10+

### 安装

```bash
# 1. 克隆项目
git clone https://github.com/YOUR_USERNAME/nerfstudio-gui.git
cd nerfstudio-gui

# 2. 创建虚拟环境并安装依赖
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

### 启动

```bash
# 双击 start.bat  或 终端执行：
.venv\Scripts\python.exe app.py
```

浏览器打开 `http://localhost:8000`

> API 调试界面：`http://localhost:8000/docs`

---

## 🧱 项目结构

```
nerfstudio-gui/
├── app.py                        # FastAPI 后端 — 路由、Pydantic 模型、命令构建、SSE
├── requirements.txt              # Python 依赖
├── start.bat                     # 一键启动脚本
├── saved_paths.json              # 路径书签持久化
├── templates/
│   ├── index.html                # 主布局 — 两栏（左 1/3 表单 + 右 2/3 终端）
│   ├── terminal.html             # 终端输出 + 命令预览区
│   └── steps/
│       ├── step1_process.html    # 预处理表单
│       ├── step2_train.html      # 训练表单（nerfacto / splatfacto）
│       ├── step3_export.html     # 导出表单
│       └── step4_browse.html     # 文件浏览器 + 书签管理
├── static/
│   ├── style.css                 # 暗色主题样式
│   └── app.js                    # 前端逻辑（Tab切换、SSE、文件浏览、RAFTerminal）
└── --help文档/                   # nerfstudio CLI 参考文档
```

---

## 🔧 技术架构

```
浏览器 (HTML/CSS/JS)
    │  POST JSON
    ▼
FastAPI 后端
    ├─ Pydantic 校验参数
    ├─ build_*_cmd() 构建命令行
    └─ run_in_conda() 异步子进程
        │  cmd /c "conda activate nerfstudio && {cmd}"
        ▼
    nerfstudio CLI
        │  逐行 stdout
        ▼
    SSE Stream → 浏览器实时显示
```

### 关键设计

- **方法参数隔离**：`build_train_cmd` 用 `if r.method == "nerfacto"` / `"splatfacto"` 分支，确保两种方法的专属参数互不污染
- **RAF 终端缓冲**：`requestAnimationFrame` 批量写入 DOM，训练时每秒数十行日志也不会卡死页面
- **纯 class 控制显示隐藏**：`.hidden { display: none; }` + JS `classList.toggle`，不用内联 `style.display`，CSS 统一管理
- **`PYTHONIOENCODING=utf-8`**：解决 Windows GBK 终端无法编码 emoji 的问题

---

## 🎯 适用场景

如果你是 Nerfstudio 用户，经常需要：

1. 反复调整 COLMAP 参数重新预处理
2. 同一份数据用不同方法跑对比实验
3. 在不同路径之间切换
4. 不想每次手敲几十个参数

那这个工具能显著提升效率。

---

## 📄 License

MIT

---

## 🙏 致谢

- [Nerfstudio](https://github.com/nerfstudio-project/nerfstudio) — 强大的 NeRF 框架
- [FastAPI](https://fastapi.tiangolo.com/) — 高性能 Python Web 框架
