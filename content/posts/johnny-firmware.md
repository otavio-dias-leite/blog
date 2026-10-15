---
title: "Johnny"
date: 2026-10-15T18:00:00-03:00
draft: false
description: "Um projeto experimental de firmware para explorar música, síntese sonora e ferramentas de áudio em um dispositivo ESP32."
tags:
  - sistemas embarcados
  - ESP32
  - M5Stack
  - firmware
  - áudio
  - inteligência artificial
categories:
  - projetos
lang: "pt-BR"
---


O **Johnny Firmware** é um projeto experimental para o M5Stack Cardputer ADV. A proposta é explorar o dispositivo como uma pequena plataforma musical portátil, reunindo ferramentas de áudio em um firmware próprio e adaptado às limitações do hardware.

A ideia vai além de simplesmente reproduzir arquivos: quero experimentar diferentes formas de gerar, controlar e trabalhar com áudio usando um dispositivo compacto baseado em ESP32.

## O que estou explorando

Entre os recursos do projeto estão:

- **Sintetizador:** geração de notas e experimentação sonora a partir do teclado do Cardputer.
- **MP3 Player:** reprodução de músicas armazenadas no dispositivo.
- **Afinador:** identificação de notas para auxiliar na afinação de instrumentos.
- **Web Radio:** reprodução de áudio via streaming.
- **Gravação de áudio:** experimentos com captura e reprodução de som.
- **Equalizador:** controles para explorar ajustes e características do áudio.

Os módulos estão em desenvolvimento e passam por testes e ajustes. O objetivo é que cada função seja realmente utilizável no hardware, e não apenas apareça no menu.

## Desenvolvimento com IA e ajustes manuais

Estou estruturando boa parte do Johnny com auxílio de inteligência artificial. Uso a IA para acelerar a criação de módulos, organizar o código, investigar problemas e experimentar implementações.

Mas o projeto não é simplesmente código gerado automaticamente. Faço alterações manuais, reviso trechos e ajusto o comportamento conforme os testes no dispositivo. A IA funciona como uma ferramenta de desenvolvimento; as decisões de implementação e os ajustes continuam fazendo parte do meu trabalho.

Minha área de interesse é **hardware**, especialmente sistemas embarcados. Por isso, o Johnny também é uma oportunidade de trabalhar na prática com integração entre software e hardware, gerenciamento de memória, processamento de áudio, periféricos e as limitações de um microcontrolador.

## O desafio: fazer caber e funcionar

No Cardputer ADV, memória e processamento são recursos limitados. Isso torna a otimização uma parte central do projeto.

Não basta adicionar funcionalidades: é necessário controlar o uso de memória, evitar bloqueios, administrar buffers de áudio e garantir que os módulos não interfiram uns nos outros. Minha prioridade é manter o firmware leve, estável e responsivo.

## Próximos passos

O Johnny continua em evolução. Quero consolidar primeiro os recursos musicais, melhorar a experiência de uso e testar cada módulo no hardware real antes de ampliar o escopo.

É um projeto de experimentação em que estou unindo meu interesse por hardware, sistemas embarcados e programação — usando IA para acelerar o processo, mas mantendo espaço para análise e intervenção manual.
