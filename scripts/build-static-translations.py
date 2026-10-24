#!/usr/bin/env python3
"""Build static localized copies while preserving technical vocabulary and markup."""
from __future__ import annotations
import argparse, concurrent.futures, html, json, re, shutil, tempfile, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ENDPOINT = "https://translate.googleapis.com/translate_a/single"
LOCALES = {"pt-BR": "pt-br", "es": "es", "zh-CN": "zh-cn", "ja": "ja"}
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "svg", "math", "noscript", "textarea"}
PROTECTED_TERMS = (
    "Raspberry Pi Zero W", "Cardputer ADV", "M5Stack", "M5Cardputer", "M5Launcher",
    "Vibe Coding", "Web Flasher", "High Boy", "Johnny", "Chryse", "Cyberspace",
    "ESP32-S3", "ESP32", "Arduino", "GitHub", "Git", "Linux", "JavaScript",
    "TypeScript", "Python", "HTML", "CSS", "Hugo", "IFF", "CNPq", "DAAT",
    "DOOM", "MP3", "Wi-Fi", "USB", "GPIO", "SD", "firmware", "Cardputer",
    "COMPLETE", "M5Burner", "M5Launcher", "M5Stack Cardputer"
)
CACHE_FILE = ".translation-cache.json"

# Human-reviewed Portuguese translation for the Career article. Keep this
# separate from machine translation so technical and academic terms stay exact.
CAREER_PT = {
    "My interest in technology began in childhood, driven by curiosity about electronics, computers, and how things work. At 13, I received an RFID kit from my father, which sparked an early interest in access control and security. At 14, I placed first in the entrance exam for the Electrotechnics program at IFF. At 17, I was admitted to Electrical Engineering, and at 20, I began a Bachelor's degree in Computer Science. Alongside my formal education, I have completed independent projects involving electrical installations, electronics, and physical systems.": "Meu interesse por tecnologia começou na infância, motivado pela curiosidade sobre eletrônica, computadores e como as coisas funcionam. Aos 13 anos, ganhei do meu pai um kit RFID, que despertou meu interesse inicial por controle de acesso e segurança. Aos 14 anos, fiquei em primeiro lugar no processo seletivo para o curso técnico em Eletrotécnica do IFF. Aos 17, fui aprovado em Engenharia Elétrica e, aos 20, comecei o bacharelado em Ciência da Computação. Paralelamente à formação acadêmica, realizei projetos independentes envolvendo instalações elétricas, eletrônica e sistemas físicos.",
    "I am currently expanding my knowledge of Information Security, a field closely connected to my Computer Science studies. I have been taking courses in the area and working toward professional certifications, including CCNA, OSCP, CEH, and others. My interest has increasingly turned toward hardware hacking: I have always been curious about security, and after consuming more technical content about hacking, I felt strongly motivated to explore how devices, protocols, and systems work, how they can be analyzed, and how their security can be tested responsibly.": "Atualmente, estou aprofundando meus conhecimentos em Segurança da Informação, uma área diretamente relacionada aos meus estudos em Ciência da Computação. Tenho feito diversos cursos na área e estou me preparando para buscar certificações profissionais, como CCNA, OSCP, CEH e outras. Meu interesse tem se voltado cada vez mais para o hardware hacking: sempre tive curiosidade sobre segurança e, depois de consumir mais conteúdo técnico sobre hacking, fiquei muito motivado a explorar como dispositivos, protocolos e sistemas funcionam, como podem ser analisados e como sua segurança pode ser testada de forma responsável.",
    "Embedded systems are a personal hobby, not the professional market I am currently pursuing. I take part in open-source and academic projects, acquire and experiment with different hardware products, and have recently started sharing this interest on my Instagram profile. I am open to both full-time employment (CLT) and freelance work in areas related to my education and background, including Electrotechnics, Electrical Engineering, Computer Science, Information Security, and other roles where my qualifications can be applied.": "Sistemas embarcados são um hobby pessoal, não o mercado profissional que estou buscando atualmente. Participo de projetos open source e acadêmicos, compro e experimento diferentes produtos de hardware e recentemente comecei a compartilhar esse interesse no meu perfil do Instagram. Estou aberto tanto a oportunidades de trabalho CLT quanto a serviços freelancer em áreas relacionadas à minha formação e trajetória, incluindo Eletrotécnica, Engenharia Elétrica, Ciência da Computação, Segurança da Informação e outras funções nas quais minhas qualificações possam ser aplicadas."
}

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

class HTMLTranslationParser(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.parts, self.texts, self.skip_depth, self.open_tags = [], [], 0, []
        self.feed(source)
        self.close()

    def handle_starttag(self, tag, attrs):
        self.parts.append(self.get_starttag_text())
        values = dict(attrs)
        skip = (tag.lower() in SKIP_TAGS or "data-no-translate" in values
                or values.get("translate") == "no"
                or "notranslate" in values.get("class", "").split())
        # Do not track void elements: they have no closing tag.
        if tag.lower() not in VOID_TAGS:
            self.open_tags.append((tag.lower(), skip))
            if skip: self.skip_depth += 1

    def handle_startendtag(self, tag, attrs): self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        self.parts.append(f"</{tag}>")
        for index in range(len(self.open_tags)-1, -1, -1):
            if self.open_tags[index][0] == tag.lower():
                removed = self.open_tags[index:]
                self.open_tags = self.open_tags[:index]
                self.skip_depth = max(0, self.skip_depth-sum(1 for _, flag in removed if flag))
                break

    def handle_data(self, data):
        if self.skip_depth or not data.strip() or len(data.strip()) < 2:
            self.parts.append(data); return
        index = len(self.texts); self.texts.append(data)
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
        terms = sorted(PROTECTED_TERMS, key=len, reverse=True)
        self.term_pattern = re.compile(r"(?<![A-Za-z0-9])(?:" + "|".join(re.escape(x) for x in terms) + r")(?![A-Za-z0-9])", re.IGNORECASE)

    def protect_terms(self, value):
        terms = []
        def replace(match):
            token = f"QZXTERM{len(terms):04d}XZQ"
            terms.append(match.group(0))
            return token
        return self.term_pattern.sub(replace, value), terms

    def translate_one(self, value, target):
        params = urlencode({"client":"gtx", "sl":"en", "tl":target, "dt":"t", "q":value})
        request = Request(ENDPOINT + "?" + params, headers={"User-Agent":"Mozilla/5.0 static-i18n/3.0", "Accept":"application/json"})
        error = None
        for attempt in range(4):
            try:
                with urlopen(request, timeout=20) as response:
                    data = json.loads(response.read().decode("utf-8"))
                pieces = data[0] if isinstance(data, list) and data else []
                result = "".join(part[0] for part in pieces if isinstance(part, list) and part and isinstance(part[0], str))
                if not result.strip(): raise ValueError("empty translation")
                return result
            except Exception as exc:
                error = exc
                if attempt < 3: time.sleep(1.2 * (attempt + 1))
        raise RuntimeError(f"translation request failed: {error}")

    def translate(self, texts, target):
        output, pending = [None] * len(texts), []
        for index, raw in enumerate(texts):
            # Preserve whitespace around inline HTML boundaries. Translators often
            # trim these characters, which otherwise joins adjacent words/tags.
            leading = raw[:len(raw) - len(raw.lstrip())]
            trailing = raw[len(raw.rstrip()):]
            core = raw.strip()
            if not core:
                output[index] = raw
                continue
            if target == "pt" and core in CAREER_PT:
                output[index] = leading + CAREER_PT[core] + trailing
                continue
            key = target + "|" + core
            if key in self.cache:
                output[index] = leading + self.cache[key] + trailing
            else:
                protected, terms = self.protect_terms(core)
                pending.append((index, key, core, protected, terms, leading, trailing))
        def work(item):
            return self.translate_one(item[3], target)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(work, item) for item in pending]
            for item, future in zip(pending, futures):
                index, key, raw, protected, terms, leading, trailing = item
                try:
                    value = future.result()
                    valid = True
                    for term_index, term in enumerate(terms):
                        token = f"QZXTERM{term_index:04d}XZQ"
                        if token not in value:
                            valid = False; break
                        value = value.replace(token, term)
                    if not valid: value = raw
                    if value != raw: self.cache[key] = value
                    output[index] = leading + value + trailing
                except Exception as exc:
                    print(f"WARNING: {exc}; retaining source text.")
                    output[index] = leading + raw + trailing
        return output

def should_skip(path):
    return any(part in {".git", ".github", "node_modules", "firmware", "dist", *LOCALES.values()} for part in path.parts)

def set_document_locale(source, language, folder):
    def update(match):
        attrs = re.sub(r'\s+lang=(["\']).*?\1', "", match.group(1), flags=re.I)
        attrs = re.sub(r'\s+data-static-locale=(["\']).*?\1', "", attrs, flags=re.I)
        return f'<html{attrs} lang="{language}" data-static-locale="{folder}">'
    return re.sub(r"<html\b([^>]*)>", update, source, count=1, flags=re.I)

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
    html_files = [p for p in root.rglob("*.html") if not should_skip(p.relative_to(root))]
    for language in [x.strip() for x in args.languages.split(",") if x.strip()]:
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
        print(f"Generated {language}: {root / folder}")
    cache_path.write_text(json.dumps(translator.cache, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

if __name__ == "__main__":
    main()
