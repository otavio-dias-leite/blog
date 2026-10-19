#!/usr/bin/env python3
"""Generate cached static translations while preserving headings and technical terms."""
from __future__ import annotations
import argparse, html, json, re, shutil, tempfile, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ENDPOINT = "https://translate.googleapis.com/translate_a/single"
LOCALES = {"pt-BR": "pt-br", "es": "es", "zh-CN": "zh-cn", "ja": "ja"}
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "svg", "math", "noscript", "textarea", "title", "h1", "h2", "h3", "h4", "h5", "h6"}
PROTECTED_TERMS = (
    "Raspberry Pi Zero W", "Cardputer ADV", "M5Stack", "M5Cardputer", "M5Launcher",
    "Vibe Coding", "Web Flasher", "High Boy", "Johnny", "Chryse", "Cyberspace",
    "ESP32-S3", "ESP32", "Arduino", "GitHub", "Git", "Linux", "JavaScript",
    "TypeScript", "Python", "HTML", "CSS", "Hugo", "IFF", "CNPq", "DAAT",
    "DOOM", "MP3", "Wi-Fi", "USB", "GPIO", "SD", "firmware"
)
CACHE_FILE = ".translation-cache.json"

class HTMLTranslationParser(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.texts = []
        self.skip_depth = 0
        self.open_tags = []
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())
        values = dict(attrs)
        should_skip = (tag.lower() in SKIP_TAGS or "data-no-translate" in values
                       or values.get("translate") == "no"
                       or "notranslate" in values.get("class", "").split())
        self.open_tags.append((tag.lower(), should_skip))
        if should_skip:
            self.skip_depth += 1

    def handle_startendtag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")
        for index in range(len(self.open_tags) - 1, -1, -1):
            opened, skipped = self.open_tags[index]
            if opened == tag.lower():
                removed = self.open_tags[index:]
                self.open_tags = self.open_tags[:index]
                self.skip_depth = max(0, self.skip_depth - sum(1 for _, flag in removed if flag))
                break

    def handle_data(self, data):
        if self.skip_depth or not data.strip() or len(data.strip()) < 2:
            self.parts.append(data)
            return
        index = len(self.texts)
        self.texts.append(data)
        self.parts.append(f"\x00STATIC_I18N_{index}\x00")

    def handle_entityref(self, name): self.parts.append(f"&{name};")
    def handle_charref(self, name): self.parts.append(f"&#{name};")
    def handle_comment(self, data): self.parts.append(f"<!--{data}-->")
    def handle_decl(self, decl): self.parts.append(f"<!{decl}>")
    def unknown_decl(self, data): self.parts.append(f"<![{data}]>")

    def output(self, translated):
        result = "".join(self.parts)
        for index, value in enumerate(translated):
            result = result.replace(f"\x00STATIC_I18N_{index}\x00", html.escape(value, quote=False))
        return result

class Translator:
    def __init__(self, cache):
        self.cache = cache
        self.term_pattern = re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(re.escape(x) for x in sorted(PROTECTED_TERMS, key=len, reverse=True)) + r")(?![A-Za-z0-9])", re.IGNORECASE)

    def protect_terms(self, value):
        terms = []
        def replace(match):
            token = f"QZXTERM{len(terms):04d}XZQ"
            terms.append(match.group(0))
            return token
        return self.term_pattern.sub(replace, value), terms

    def one_batch(self, texts, target):
        params = [("client", "gtx"), ("sl", "en"), ("tl", target), ("dt", "t")]
        params.extend(("q", value) for value in texts)
        request = Request(ENDPOINT + "?" + urlencode(params), headers={"User-Agent": "Mozilla/5.0 static-i18n-builder/2.0", "Accept": "application/json"})
        last_error = None
        for attempt in range(3):
            try:
                with urlopen(request, timeout=18) as response:
                    data = json.loads(response.read().decode("utf-8"))
                groups = data[0]
                if len(texts) == 1: groups = [groups]
                output = []
                for index in range(len(texts)):
                    group = groups[index] if index < len(groups) else []
                    output.append("".join(part[0] for part in group if isinstance(part, list) and part and part[0]))
                if len(output) != len(texts) or any(not value for value in output):
                    raise ValueError("Translation response was incomplete")
                return output
            except Exception as exc:
                last_error = exc
                if attempt < 2: time.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"Free translation endpoint failed for {target}: {last_error}")

    def translate(self, texts, target):
        result = [None] * len(texts)
        missing, positions = [], []
        for index, raw in enumerate(texts):
            key = target + "|" + raw
            if key in self.cache:
                result[index] = self.cache[key]
            else:
                protected, terms = self.protect_terms(raw)
                missing.append((protected, terms, raw))
                positions.append((index, key))
        for offset in range(0, len(missing), 12):
            batch = missing[offset:offset + 12]
            try:
                translated = self.one_batch([item[0] for item in batch], target)
            except Exception as exc:
                print(f"WARNING: {exc}; leaving this batch in English.")
                translated = [item[0] for item in batch]
            for local_index, ((position, key), value) in enumerate(zip(positions[offset:offset + 12], translated)):
                protected, terms, original = batch[local_index]
                for term_index, term in enumerate(terms):
                    token = f"QZXTERM{term_index:04d}XZQ"
                    if token not in value:
                        value = original
                        break
                    value = value.replace(token, term)
                result[position] = value
                if value != original: self.cache[key] = value
        return result

def should_skip(path):
    return any(part in {".git", ".github", "node_modules", "firmware", "dist", *LOCALES.values()} for part in path.parts)

def set_document_locale(source, language, folder):
    def update(match):
        attrs = re.sub(r'\s+lang=(["\']).*?\1', "", match.group(1), flags=re.IGNORECASE)
        attrs = re.sub(r'\s+data-static-locale=(["\']).*?\1', "", attrs, flags=re.IGNORECASE)
        return f'<html{attrs} lang="{language}" data-static-locale="{folder}">'
    return re.sub(r"<html\b([^>]*)>", update, source, count=1, flags=re.IGNORECASE)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("site_dir", type=Path)
    parser.add_argument("--languages", default="pt-BR,es,zh-CN,ja")
    args = parser.parse_args()
    root = args.site_dir.resolve()
    if not root.is_dir(): raise SystemExit(f"Site directory does not exist: {root}")
    cache_path = root.parent / CACHE_FILE
    try: cache = json.loads(cache_path.read_text(encoding="utf-8"))
    except Exception: cache = {}
    translator = Translator(cache)
    html_files = [path for path in root.rglob("*.html") if not should_skip(path.relative_to(root))]
    languages = [item.strip() for item in args.languages.split(",") if item.strip()]
    for language in languages:
        folder = LOCALES.get(language)
        if not folder: continue
        with tempfile.TemporaryDirectory(prefix="static-i18n-") as temp:
            staging = Path(temp) / folder
            shutil.copytree(root, staging, ignore=shutil.ignore_patterns(*LOCALES.values(), ".git", "node_modules", "dist"))
            for source_file in html_files:
                relative = source_file.relative_to(root)
                if "admin" in relative.parts: continue
                destination = staging / relative
                if not destination.exists(): continue
                parsed = HTMLTranslationParser(source_file.read_text(encoding="utf-8"))
                translated = translator.translate(parsed.texts, language.split("-")[0])
                destination.write_text(set_document_locale(parsed.output(translated), language, folder), encoding="utf-8")
            target = root / folder
            if target.exists(): shutil.rmtree(target)
            shutil.copytree(staging, target)
        print(f"Generated static {language} pages: {root / folder}")
    cache_path.write_text(json.dumps(translator.cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

if __name__ == "__main__":
    main()
