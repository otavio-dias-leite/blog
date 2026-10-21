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
SKIP_TAGS = {"script", "style", "code", "pre", "kbd", "samp", "svg", "math", "noscript", "textarea", "title", "h1", "h2", "h3", "h4", "h5", "h6"}
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
    "My interest in technology started long before university. As a child, I experimented with computers and game development, building small projects with Unity 3D and Scratch. At 12, my father and uncle gave me a Raspberry Pi and an Arduino, which led to years of hands-on experiments with electronics and physical devices. At 14, I placed first in the entrance exam for the Electrotechnics program at IFF. At 17, I was admitted to Electrical Engineering; I have not verified my exact ranking, but believe I placed among the top four. At 20, I began a Bachelor's degree in Computer Science at a private university. Along the way, I contributed to formal projects involving embedded systems and physical devices, and also carried out electrical installation work independently.": "Meu interesse por tecnologia começou muito antes da universidade. Ainda criança, experimentei computadores e desenvolvimento de jogos, criando pequenos projetos com Unity 3D e Scratch. Aos 12 anos, meu pai e meu tio me deram um Raspberry Pi e um Arduino. Isso deu início a anos de experiências práticas com eletrônica e dispositivos físicos. Aos 14 anos, fiquei em primeiro lugar no processo seletivo para o curso técnico em Eletrotécnica do IFF. Aos 17, fui aprovado em Engenharia Elétrica; não conferi minha classificação exata, mas acredito ter ficado entre os quatro primeiros. Aos 20, comecei o bacharelado em Ciência da Computação em uma universidade particular. Nesse percurso, contribuí para projetos formais envolvendo sistemas embarcados e dispositivos físicos, além de realizar trabalhos de instalações elétricas de forma independente.",
    "My professional foundation is in Electrical Engineering and Electrotechnics. I am interested in opportunities in Industry 4.0, especially where electrical systems, embedded devices, and IoT meet. This includes autonomous systems, off-grid solar installations, monitoring, and control. Programming began as a hobby, but studying Computer Science led me to approach it more seriously. I completed my first semester with a GPA above 9.2. I am also interested in Information Security and cloud computing, particularly protecting networks and connected devices. My interest in security grew from hands-on experiments with an Arduino RFID kit my father gave me and from building an infrared signal receiver and transmitter. These projects sparked my curiosity about access control, communications, and device security.": "Minha base profissional está na Engenharia Elétrica e na Eletrotécnica. Busco oportunidades na Indústria 4.0, especialmente na integração entre sistemas elétricos, dispositivos embarcados e IoT. Isso inclui sistemas autônomos, instalações solares off-grid, monitoramento e controle. A programação começou como um hobby, mas o curso de Ciência da Computação me levou a estudá-la de maneira mais aprofundada. Concluí meu primeiro semestre com CR acima de 9,2. Também tenho interesse em Segurança da Informação e computação em nuvem, sobretudo na proteção de redes e dispositivos conectados. Meu interesse por segurança cresceu a partir de experiências práticas com um kit RFID para Arduino que ganhei do meu pai e da construção de um receptor e transmissor de sinais infravermelhos. Esses projetos despertaram minha curiosidade por controle de acesso, comunicação e segurança de dispositivos.",
    "I have taken part in cybersecurity training initiatives, including Hackers do Bem, and plan to strengthen my foundations through further study in areas such as CCNA, OSCP, and CEH. I am also interested in courses and certifications from providers such as Solyd and DESEC as complementary learning opportunities; I do not see certificates as a substitute for practical knowledge. My goal is to build a career connecting electrical and physical systems with secure, connected infrastructure, especially embedded devices, industrial IoT, and network security. I am open to professional opportunities, internships, and collaborations in these fields.": "Participei de iniciativas de formação em cibersegurança, incluindo o Hackers do Bem, e pretendo fortalecer minha base de conhecimentos com estudos em áreas como CCNA, OSCP e CEH. Também tenho interesse em cursos e certificações de instituições como Solyd e DESEC, como oportunidades complementares de aprendizado. Não considero certificados substitutos do conhecimento prático. Meu objetivo é construir uma carreira que conecte sistemas elétricos e físicos a infraestruturas conectadas e seguras, especialmente dispositivos embarcados, IoT industrial e segurança de redes. Estou aberto a oportunidades profissionais, estágios e colaborações nessas áreas."
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
