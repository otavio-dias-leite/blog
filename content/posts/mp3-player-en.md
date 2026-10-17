---
title: "MP3 Player Firmware for M5Stack Cardputer ADV"
slug: "mp3-player-en"
date: 2026-10-16T00:00:00-03:00
description: "An MP3 playback firmware project for the M5Stack Cardputer ADV, featuring microSD browsing, playback controls, ID3 metadata, equalizer and a compact interface."
tags:
  - electronics
  - ESP32
  - M5Stack
  - firmware
  - MP3
  - audio
categories:
  - projects
lang: "en"
projectTranslation: true
---

**MP3 Player** is a dedicated firmware project for the **M5Stack Cardputer ADV**, built to play MP3 music directly from a microSD card.

The goal is to turn the Cardputer ADV into a compact music player with a focused interface and local playback. The firmware browses folders and tracks, manages playback and displays useful music information.

## Features

- Browse MP3 files and folders on a microSD card.
- Play, pause, stop, skip tracks and seek through a song.
- Read ID3 metadata such as title and artist.
- Display embedded album artwork when supported.
- Five-band equalizer, playback modes and audio visualizers.
- Multiple color themes and Cardputer RGB LED integration.

The project is designed around the memory and processing limits of the ESP32-S3. Audio decoding is handled incrementally, with buffering intended to keep the interface responsive during playback.

## Project links

- **Project website:** https://otavio-dias-leite.github.io/mp3player/
- **GitHub source code:** https://github.com/otavio-dias-leite/mp3player
- **Developer portfolio:** https://otavio-dias-leite.github.io/portfolio/
