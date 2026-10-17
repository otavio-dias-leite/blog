#!/usr/bin/env python3
"""Build pre-translated static copies of an English HTML site.

Uses Google's public translate endpoint at build time. The English source tree is
never modified. HTML markup, attributes, scripts, styles and code are preserved.
"""
from __future__ import annotations
import argparse
import fnmatch
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import random
import shutil
import tempfile
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ENDPOINT = "https://translate.googleapis.com/translate_a/single"
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "svg", "math", "noscript", "textarea"}
LANGUAGES = {
    "pt-BR": "pt-br",
    "es": "es",
    "zh-CN": "zh-cn",
    "ja": "ja",
}
CACHE_FILE = ".translation-cache.json"

class HTMLTranslationParser(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self.texts: list[str] = []
        self.skip_depth = 0
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())
        if tag.lower() in SKIP_TAGS:
            self.skip_depth += 1

    def handle_startendtag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")
        if tag.lower() in SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data):
        if self.skip_depth or not data.strip() or len(data.strip()) < 2:
            self.parts.append(data)
            return
        index = len(self.texts)
        self.texts.append(data)
        self.parts.append(f"\x00STATIC_I18N_{index}\x00")

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")

    def handle_comment(self, data):
        self.parts.append(f"<!--{data}-->")

    def handle_decl(self, decl):
        self.parts.append(f"<!{decl}>")

    def unknown_decl(self, data):
        self.parts.append(f"<![{data}]>")

    def output(self, translated: list[str]) -> str:
        result = "".join(self.parts)
        for i, value in enumerate(translated):
            result = result.replace(f"\x00STATIC_I18N_{i}\x00", html.escape(value, quote=False))
        return result

class Translator:
    def __init__(self, cache: dict):
        self.cache = cache

    def one_batch(self, texts: list[str], target: str) -> list[str]:
        params = [("client", "gtx"), ("sl", "en"), ("tl", target), ("dt", "t")]
        params.extend(("q", value) for value in texts)
        url = ENDPOINT + "?" + urlencode(params)
        request = Request(url, headers={"User-Agent": "Mozilla/5.0 static-i18n-builder/1.0", "Accept": "application/json"})
        last_error = None
        for attempt in range(4):
            try:
                with urlopen(request, timeout=25) as response:
                    data = json.loads(response.read().decode("utf-8"))
                groups = data[0]
                if len(texts) == 1:
                    groups = [groups]
                output = []
                for i in range(len(texts)):
                    group = groups[i] if i < len(groups) else []
                    output.append("".join(part[0] for part in group if isinstance(part, list) and part and part[0]))
                if len(output) != len(texts) or any(not value for value in output):
                    raise ValueError("Translation response was incomplete")
                return output
            except Exception as exc:
                last_error = exc
                time.sleep((1.5 ** attempt) + random.random())
        raise RuntimeError(f"Translation provider failed for {target}: {last_error}")

    def translate(self, texts: list[str], target: str) -> list[str]:
        result = [None] * len(texts)
        missing = []
        positions = []
        for i, raw in enumerate(texts):
            key = target + "|" + raw
            if key in self.cache:
                result[i] = self.cache[key]
            else:
                missing.append(raw)
                positions.append((i, key))
        for offset in range(0, len(missing), 10):
            batch = missing[offset:offset + 10]
            try:
                translated = self.one_batch(batch, target)
            except Exception:
                # Keep the source text rather than breaking the deployment.
                translated = batch
            for local_index, ((position, key), value) in enumerate(zip(positions[offset:offset + 10], translated)):
                result[position] = value
                if value != batch[local_index]:
                    self.cache[key] = value
        return result

def should_skip(path: Path) -> bool:
    parts = path.parts
    return any(part in {".git", ".github", "node_modules", "firmware", "dist"} for part in parts)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("site_dir", type=Path)
    parser.add_argument("--languages", default="pt-BR,es,zh-CN,ja")
    args = parser.parse_args()
    root = args.site_dir.resolve()
    if not root.is_dir():
        raise SystemExit(f"Site directory does not exist: {root}")
    cache_path = root.parent / CACHE_FILE
    try:
        cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception:
        cache = {}
    translator = Translator(cache)
    html_files = [p for p in root.rglob("*.html") if not should_skip(p.relative_to(root))]
    languages = [x.strip() for x in args.languages.split(",") if x.strip()]
    for language in languages:
        folder = LANGUAGES.get(language)
        if not folder:
            continue
        with tempfile.TemporaryDirectory(prefix="static-i18n-") as temp:
            staging = Path(temp) / folder
            shutil.copytree(root, staging, ignore=shutil.ignore_patterns(*LANGUAGES.values(), ".git", "node_modules", "dist"))
            for source_file in html_files:
                relative = source_file.relative_to(root)
                if "blog" in relative.parts and "admin" in relative.parts:
                    continue
                destination = staging / relative
                if not destination.exists():
                    continue
                original = source_file.read_text(encoding="utf-8")
                parsed = HTMLTranslationParser(original)
                translated = translator.translate(parsed.texts, language.split("-")[0])
                output = parsed.output(translated)
                output = output.replace('<html ', f'<html lang="{language}" data-static-locale="{folder}" ', 1)
                destination.write_text(output, encoding="utf-8")
            target = root / folder
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(staging, target)
        print(f"Generated static {language} site: {root / folder}")
    cache_path.write_text(json.dumps(translator.cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

if __name__ == "__main__":
    main()
