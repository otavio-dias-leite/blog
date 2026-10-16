---
title: "MP3 Player：适用于 M5Stack Cardputer ADV 的 MP3 播放固件"
slug: "mp3-player-zh"
date: 2026-10-16T00:00:00-03:00
description: "为 M5Stack Cardputer ADV 开发的 MP3 播放固件项目，支持 microSD 文件浏览、播放控制、ID3 信息、均衡器和紧凑界面。"
tags:
  - 嵌入式系统
  - ESP32
  - M5Stack
  - 固件
  - MP3
  - 音频
categories:
  - 项目
lang: "zh-CN"
projectTranslation: true
---

**MP3 Player** 是一个专为 **M5Stack Cardputer ADV** 开发的固件项目，可直接从 microSD 卡播放 MP3 音乐。

该项目旨在将 Cardputer ADV 变成一款小型便携音乐播放器，提供简洁的操作界面和本地音乐播放功能。固件可以浏览文件夹与曲目、控制播放，并显示音乐信息。

## 主要功能

- 浏览 microSD 卡中的 MP3 文件和文件夹。
- 播放、暂停、停止、切换曲目和调整播放进度。
- 读取标题、艺术家等 ID3 元数据。
- 显示音频文件中嵌入的专辑封面（在支持的情况下）。
- 五段均衡器、播放模式和音频可视化效果。
- 多种配色主题，并支持 Cardputer RGB LED 联动。

该项目针对 ESP32-S3 的内存和处理能力进行设计。音频解码采用分阶段处理和缓冲机制，目标是在播放音乐时保持界面响应。

## 项目链接

- **项目网站：** https://otavio-dias-leite.github.io/mp3player/
- **GitHub 源代码：** https://github.com/otavio-dias-leite/mp3player
- **开发者作品集：** https://otavio-dias-leite.github.io/portfolio/
