# Gosling Cinema — Project Knowledge

> 复古电影胶卷滚动体验网站，用 Three.js WebGL 后处理 + Lenis 平滑滚动 + CSS 3D 旋转木马，致敬 Ryan Gosling 五部代表作。

## Quick Facts

| Metric | Value |
|---|---|
| What | 复古 CRT 电脑 → 3D 胶卷轮播的沉浸式滚动体验 |
| Built by | yangyihan with Claude Code |
| Timeline | 2026-04-01 → 2026-04-07 (7 天) |
| Commits | 2 (大量迭代在本地完成) |
| Tech stack | Vite + Three.js + GSAP + Lenis + 原生 JS |
| Monthly cost | $0 (EdgeSpark 免费托管) |
| Repo | github.com/Younginspace/gosling-cinema |

## The Problem

看到 [shader.se](https://shader.se) 的复古 CRT 启动 → 3D 胶卷滚动交互后深受启发，觉得这种电影胶卷的呈现形式非常适合做一个演员的高光作品集。正好最近因为《挽救计划》电影对 Ryan Gosling 印象深刻，决定把这个创意落地——用高司令五部代表作（Drive、Blade Runner 2049、La La Land、Barbie、Project Hail Mary）来做一个沉浸式的电影体验网站。

核心理念是"原创-复刻融合微创新的螺旋上升"：不是完全复制 shader.se，而是借鉴它的 CRT 开机 + 胶卷滚动范式，融入自己的 3D 旋转木马、每部电影独立的 shader 风格、视频嵌入等原创元素。

## Key Decisions

### Decision: 用 AnyCap CLI + Gemini 理解录屏替代截图
- **Context**: 最初用截图喂给 AI 来还原 shader.se 的效果，但还原度很低
- **Options considered**: 截图描述 vs 录屏分析
- **Chosen**: 用朋友的 AnyCap CLI 工具把录屏交给 Gemini 理解后再给 AI
- **Why**: 视频比截图信息密度高得多，AI 能理解动态效果、过渡动画、交互逻辑
- **Result**: 做出了虽然不完全还原但"另一种效果还行"的动态交互，眼前一亮

### Decision: 3D 胶卷旋转木马替代 shader.se 的直线胶卷条
- **Context**: shader.se 用的是水平直线胶卷条滚动
- **Chosen**: CSS 3D `preserve-3d` + `perspective(1400px)` 构建圆柱形旋转木马
- **Why**: 旋转木马的深度感更强，边缘帧自然缩小和透明化，视觉层次更丰富
- **Result**: 每帧有独立的 spiralRadius / spiralY / frameScale / frameOpacity 计算

### Decision: 每部电影独立的 shader 特效参数
- **Context**: 需要视觉上区分不同电影的氛围
- **Chosen**: 每部电影定义独立的 bloom、chromatic、noise、vignette、scanline、sepia、tint 参数
- **Why**: Drive 的霓虹粉红 vs Blade Runner 的暖橙怀旧 vs La La Land 的深紫浪漫——shader 参数是最低成本的氛围切换
- **Result**: 切换电影时所有后处理参数平滑 lerp 过渡，零突变

### Decision: 视频素材托管在 GitHub Releases
- **Context**: 视频文件太大无法直接放 repo
- **Chosen**: 上传到 `github.com/Younginspace/gosling-cinema/releases/tag/v1.0-assets`
- **Why**: 免费、稳定、无需额外 CDN 配置

### Decision: Lenis 做平滑滚动而非原生 scroll
- **Context**: 需要电影感的滚动手感
- **Chosen**: Lenis + 自定义 easing `Math.min(1, 1.001 - Math.pow(2, -10 * t))`
- **Why**: 原生滚动太线性，Lenis 提供可控的缓动曲线和精确的 scroll 进度回调

## Architecture

### Tech Stack
| Layer | Choice | Why |
|---|---|---|
| 构建 | Vite 8 | 零配置、HMR 快、ESM 原生 |
| 3D 引擎 | Three.js 0.183 | WebGL 渲染、GLTF 加载、后处理管线 |
| 后处理 | 自写 GLSL shader | Film grain、chromatic aberration、scanline、vignette、distortion |
| 滚动 | Lenis 1.3 | 平滑滚动 + 精确进度回调 |
| 动画 | GSAP 3.14 | UI 文字过渡动画 |
| 3D 模型 | Commodore PET 2001 GLB | Blender 导出的复古电脑模型 |
| 部署 | EdgeSpark | 快速后端+部署，易上手，免费 |

### System Design

```
index.html
  ├── #boot-screen (HTML CRT 启动序列)
  ├── #webgl-canvas (Three.js 固定背景)
  ├── #hero-overlay (标题覆盖层)
  ├── #carousel-viewport (CSS 3D 旋转木马)
  │   └── #carousel-cylinder (.film-segment × 15)
  ├── UI (film-info, nav, dots, mute)
  └── #scroll-spacer (300vh 不可见滚动空间)
```

**后处理管线** (5 pass):
```
RenderPass → UnrealBloomPass → DistortionShader → FilmShader → OutputPass
```

### 核心交互流

```
用户滚动 (Lenis)
  │
  ├── 0-25% scroll: Hero 阶段
  │   └── 标题可见, 3D 模型静止
  │
  ├── 25-70% scroll: 过渡阶段
  │   ├── 镜头双阶段推进 (0-0.4 缓慢 → 0.4-1.0 加速冲入)
  │   ├── 模型 0.35-0.75 淡出
  │   └── Carousel UI 0.2-0.8 渐显
  │
  └── 70%+ scroll: Carousel 阶段
      ├── 滚轮驱动圆柱旋转 (sensitivity: 0.04)
      ├── 250ms 无操作后自动对齐
      └── 切换电影 → shader 参数 lerp + 视频播放
```

### Data Model

**电影数据** (`sections.js`): 5 个对象，每个包含:
- 基础信息: id, name, year, tagline, quote, color, bgColor
- 视频源: video (string | string[])
- Shader 参数: effects { bloom, chromatic, sepia, noise, vignette, scanline }
- 色调: tint [r, g, b]

**Carousel 状态**: currentIndex, targetRotation, currentRotation, velocity, isDragging

## Development Timeline

| 日期 | 里程碑 | Commits |
|---|---|---|
| 2026-04-01 | 项目创建；录屏分析 shader.se；CRT boot + 3D 模型 + 后处理管线 + 基础滚动全部跑通 | 1 |
| 2026-04-02 | 修复加载流程、carousel 位置、模型布局；录制 record2 分析当前状态 | 1 |
| 2026-04-03 | scene.js 大改 — 完善 shader 参数和镜头运动 | 0 (local) |
| 2026-04-07 | carousel.js + main.js + style.css 最终调优；sections.js 更新视频源 | 0 (local) |

## How Builder & AI Collaborated

### Workflow
1. **录屏分析先行**: 用 AnyCap CLI 的 video-read 功能（基于 Gemini）分析 shader.se 录屏，生成结构化的视觉描述文档（`record_analysis/`）
2. **分析文档作为 prompt**: 把分析文档作为上下文喂给 Claude Code，让它理解目标效果
3. **迭代调参**: 3D 模型位置、shader 参数、滚动阈值等大量数值需要反复微调

### Key Insight: 视频 > 截图
截图只能捕捉静态帧，丢失了动画节奏、过渡效果、交互响应等关键信息。用 Gemini 理解录屏后生成的文字描述，比截图描述准确得多，AI 能更好地理解"这个效果应该怎么动"。

## Pitfalls & Solutions

### Pitfall: 截图还原度低
- **Symptom**: 用截图喂给 AI，生成的效果和原站差距很大
- **Root cause**: 静态截图无法传达动画节奏、过渡缓动、交互反馈等动态信息
- **Fix**: 改用 AnyCap CLI + Gemini 理解录屏，生成详细的动态效果描述
- **Prevention**: 对于动态交互效果，始终用视频而非截图作为参考素材

### Pitfall: 3D 模型定位
- **Symptom**: Commodore PET 模型在场景中的位置、大小、角度需要大量调试
- **Root cause**: 模型中心点、缩放比例、屏幕网格位置（法语命名 `Plan_7`, `vitre`）不直观
- **Fix**: 先 `Box3` 计算包围盒归中，再 offset 调位；从 screenMesh 几何体反推相机位置
- **Prevention**: 加载模型后先 `traverse` 打印所有 mesh 名称，理解模型结构

### Pitfall: 无限循环 Carousel 的旋转归一化
- **Symptom**: 用户连续滚动时，旋转角度无限累加，最终精度丢失或 clone 帧溢出
- **Root cause**: CSS 3D transform 的角度值没有上限，但 clone 帧数量有限 (PAD=5)
- **Fix**: `scheduleNormalize()` — 动画稳定 500ms 后检测是否漂移了整圈，如果是则瞬移回标准位置
- **Prevention**: 无限滚动 carousel 必须有 rotation normalization 机制

## Build Guide (For Someone Starting Fresh)

### Prerequisites
- Node.js 18+
- 一个 3D 模型 (.glb 格式) — 可以从 Sketchfab 免费下载
- 视频素材 — 每部作品 1-2 个短片段 (30s 以内)
- 对目标效果的录屏（非常重要，比截图好得多）

### Recommended Build Order
1. **Vite 项目初始化**: `npm create vite@latest` + 安装 three, gsap, lenis
2. **基础 Three.js 场景**: renderer, camera, lights, 加载 GLB 模型
3. **CRT Boot 序列**: HTML overlay 模拟 CRT 启动，Canvas 纹理贴在模型屏幕上
4. **Lenis 滚动管线**: 300vh spacer + scroll event → progress 映射
5. **镜头推进动画**: scroll progress → camera position lerp (hero → zoom into screen)
6. **CSS 3D Carousel**: `preserve-3d` + `perspective` + 圆柱体分帧布局
7. **后处理 Shader**: bloom, chromatic aberration, film grain, vignette, scanline
8. **数据驱动**: sections.js 定义每部作品的 shader 参数和色调
9. **交互层**: wheel, drag, touch, keyboard + snap + normalize
10. **视频嵌入**: `<video>` 元素嵌入胶卷帧，按当前选中电影 play/pause

### CLAUDE.md Template

```markdown
# Gosling Cinema

复古电影胶卷滚动体验网站。

## Tech Stack
- Vite + vanilla JS (no framework)
- Three.js for WebGL + post-processing
- Lenis for smooth scroll
- GSAP for UI animation
- CSS 3D transforms for carousel

## Architecture
- `src/main.js` — 入口，Lenis 滚动管线
- `src/scene.js` — Three.js 场景、模型、后处理、动画循环
- `src/carousel.js` — 3D 胶卷旋转木马
- `src/sections.js` — 电影数据定义
- `src/boot-screen.js` — CRT 启动序列
- `src/mouse-tracker.js` — 鼠标追踪 → shader distortion
- `src/audio.js` — Web Audio API 音效

## Rules
- 所有 shader 参数变化用 lerp 平滑过渡，不允许突变
- Carousel 必须保持 rotation normalization，防止角度累加溢出
- 视频文件托管在 GitHub Releases，不要放进 repo
- 后处理管线顺序: Render → Bloom → Distortion → Film → Output
```

## Lessons Learned

### On Product
- 电影胶卷形式天然适合"作品集"类产品——自带叙事感和仪式感
- 每部电影独立的 shader 风格是低成本但高感知的差异化手段
- CRT 开机序列不只是装饰，它掩盖了 3D 模型的加载时间

### On Vibe Coding
- **视频 > 截图**: 对于动态交互效果，用 AI 理解录屏生成描述，比截图准确一个量级
- **先行动**: 从被激发灵感的创意开始动手，不必等到完美方案——创意本身就是"原创-复刻融合微创新的螺旋上升"
- **真实素材的感动**: 把真实视频素材放进去本地预览成功的那一刻，是整个项目最有成就感的时刻
- 不完全还原也没关系——做出"另一种效果还行"的东西，比追求完美复刻更有价值

### On Technical Choices
- Lenis 的自定义 easing 函数对"电影感"滚动手感至关重要
- CSS 3D `preserve-3d` 的旋转木马比 Three.js 内部做 carousel 更轻量，且能直接嵌入 `<video>` 元素
- 后处理 shader 里 chromatic aberration 的细微程度 (0.001-0.008) 就足以制造风格差异
- 无限循环 carousel 的 clone + normalize 机制是必须的，否则长时间使用会出 bug
- Web Audio API 纯合成音效（无外部文件）是可行的，CRT 嗡嗡声和胶片咔哒声效果不错
