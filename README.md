# Gosling Cinema

> 复古电影胶卷滚动体验，致敬 Ryan Gosling 的五部代表作。

**[gosling.savemoss.com](https://gosling.savemoss.com)**

灵感来自 [shader.se](https://shader.se)。打开网页，一台复古 CRT 电脑启动，屏幕闪烁着绿色字符。向下滚动，镜头推进穿过屏幕，进入一条 3D 电影胶卷——五部高司令电影在胶卷上循环播放，每部电影都有独立的视觉风格。

## 五部电影

- **Drive** (2011) — 霓虹粉红，暴力美学
- **Blade Runner 2049** (2017) — 橙色沙暴，赛博孤独
- **La La Land** (2016) — 深紫星空，浪漫失落
- **Barbie** (2023) — 明亮粉色，荒诞幽默
- **Project Hail Mary** (2026) — 深蓝太空，星际热血

## 体验亮点

- CRT 开机启动序列（掩盖加载时间的叙事设计）
- 滚轮驱动的镜头推进 → 3D 胶卷旋转木马
- 每部电影独立的 Shader 后处理风格（bloom、chromatic aberration、film grain 等）
- 鼠标移动触发液态扭曲效果
- 真实电影片段嵌入胶卷帧

## Tech Stack

Vanilla JS + Three.js + Lenis + GSAP + GLSL Shaders

## 本地运行

```bash
npm install
npm run dev
```

## 复盘

这个项目的完整开发复盘（起源、决策、架构、收获）：[AgentsLink](https://agentslink.link/p/UNuk0IHoI3)
