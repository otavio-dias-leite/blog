---
title: "MP3 Player"
date: 2026-10-15T18:00:00-03:00
description: "Firmware dedicado à reprodução de músicas MP3 no M5Stack Cardputer ADV."
tags:
  - sistemas embarcados
  - ESP32
  - M5Stack
  - firmware
  - MP3
  - áudio
categories:
  - projetos
lang: "pt-BR"
---

O **MP3 Player** é um firmware desenvolvido para o **M5Stack Cardputer ADV**, com foco específico em reproduzir músicas no formato MP3 diretamente pelo dispositivo.

A proposta é transformar o Cardputer ADV em um pequeno player de música portátil. O firmware lê os arquivos MP3 armazenados em um cartão microSD e oferece uma interface para navegar pelas pastas, selecionar faixas e controlar a reprodução.

## Reprodução de músicas

O projeto é voltado à reprodução local de arquivos MP3. A biblioteca de músicas é lida do cartão microSD, permitindo abrir pastas e montar uma fila de reprodução. Durante a execução, é possível pausar, retomar, avançar ou voltar faixas, ajustar o volume e navegar pela posição da música.

O firmware também trabalha com informações ID3, como título e artista, e pode exibir capas incorporadas aos arquivos quando disponíveis. Há ainda equalizador de cinco bandas, modos de repetição e reprodução aleatória e diferentes visualizações durante a música.

## Interface e temas

A interface foi pensada para a tela e os controles compactos do Cardputer ADV. O usuário pode escolher entre temas visuais como **Dark Red**, **Matrix** e **Cyberpunk**, além de outras paletas. O LED RGB do dispositivo acompanha a cor do tema selecionado e reage à reprodução.

## Desenvolvimento

O desenvolvimento exige atenção aos limites de memória e processamento do ESP32-S3. O decodificador de áudio trabalha em etapas curtas, enquanto buffers e fila de saída ajudam a manter a interface responsiva durante a reprodução.

O objetivo do projeto é manter um firmware enxuto e dedicado a uma função: tocar músicas MP3 no M5Stack Cardputer ADV.