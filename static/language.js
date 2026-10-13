(() => {
  "use strict";

  /*
   * Local bilingual content for the posts currently published on the blog.
   * This intentionally avoids third-party translation widgets and cookies.
   * English is the source language; the PT-BR versions are stored here.
   */
  const STORAGE_KEY = "otavio-blog-language-v3";
  const LANGUAGES = ["en-US", "pt-BR"];

  const translations = {
    "about-me": {
      title: "Sobre mim",
      html: [
        "<p>Sou Otávio.</p>",
        "<p>Estudo Engenharia Elétrica e Ciência da Computação. Gosto de entender como as coisas funcionam, desde hardware e eletrônica até software e Linux.</p>",
        "<p>Este blog é simplesmente um espaço para anotações, experimentos e coisas que aprendo ao longo do caminho.</p>"
      ].join("")
    },
    "career": {
      title: "Carreira",
      html: [
        "<p>Decidi direcionar meus estudos e minha carreira para <strong>Segurança da Informação</strong>. Atualmente, estou fazendo cursos na área e construindo uma base mais sólida em redes, Linux, sistemas operacionais, programação e práticas de segurança.</p>",
        "<p>Meu planejamento de certificações inclui a <strong>Cisco CCNA</strong>, a <strong>Certified Ethical Hacker (CEH)</strong> e a <strong>Offensive Security Certified Professional (OSCP)</strong>. Essas são metas que pretendo alcançar, não certificações que já possuo. Quero combinar conhecimentos sólidos de redes com habilidades práticas em análise de segurança e testes ofensivos éticos.</p>",
        "<p>Até <strong>2030</strong>, meu objetivo é concluir uma pós-graduação em Segurança da Informação. Depois disso, pretendo seguir para um mestrado e, posteriormente, um doutorado com ênfase em pesquisa na área de segurança.</p>",
        "<p>A linha de pesquisa que mais me interessa é <strong>hardware hacking</strong>: entender como hardware, firmware, dispositivos embarcados, interfaces de comunicação e sistemas conectados podem ser analisados, testados e protegidos. Quero estudar segurança além da camada de aplicação, alcançando os dispositivos físicos e os componentes de baixo nível que fazem os sistemas funcionar.</p>",
        "<p>Esse caminho reúne minha formação técnica em Eletrotécnica, meus estudos em Engenharia Elétrica e Ciência da Computação e meu interesse de longa data por programação e sistemas embarcados. É nessa interseção que quero construir minha carreira profissional e acadêmica.</p>",
        "<p><strong>Atualmente, estou buscando oportunidades em Segurança da Informação.</strong> Aceito participar de projetos colaborativos, estágios, trabalhos freelancer e outras oportunidades técnicas na área. Tenho especial interesse em atividades éticas e autorizadas, como pesquisa em segurança, análise de redes e sistemas, avaliação de vulnerabilidades e testes de hardware ou firmware.</p>"
      ].join("")
    }
  };

  function readLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return LANGUAGES.includes(saved) ? saved : "en-US";
    } catch {
      return "en-US";
    }
  }

  function originalSnapshot(element, key) {
    if (!element.dataset[key]) {
      element.dataset[key] = element.innerHTML;
    }
    return element.dataset[key];
  }

  function applyLanguage(language) {
    const selected = LANGUAGES.includes(language) ? language : "en-US";
    const isPortuguese = selected === "pt-BR";
    const slugContainer = document.querySelector("[data-post-slug]");
    const slug = slugContainer?.dataset.postSlug || "";

    document.documentElement.lang = selected;

    document.querySelectorAll("[data-blog-language]").forEach(button => {
      const active = button.dataset.blogLanguage === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    // Translate the visible post list without changing URLs or post order.
    document.querySelectorAll("[data-post-title]").forEach(title => {
      const card = title.closest("[data-post-slug]");
      const postSlug = card?.dataset.postSlug || "";
      const translated = translations[postSlug]?.title;
      const original = originalSnapshot(title, "originalTitle");

      title.textContent = isPortuguese && translated ? translated : original;
    });

    // Translate article heading and body from local text, not an external widget.
    const articleTitle = document.querySelector("main.article [data-post-title]");
    const articleContent = document.querySelector("main.article [data-post-content]");
    const translation = translations[slug];

    if (articleTitle) {
      const original = originalSnapshot(articleTitle, "originalTitle");
      articleTitle.textContent = isPortuguese && translation ? translation.title : original;
    }

    if (articleContent) {
      const original = originalSnapshot(articleContent, "originalContent");
      articleContent.innerHTML = isPortuguese && translation ? translation.html : original;
    }

    try {
      localStorage.setItem(STORAGE_KEY, selected);
    } catch {
      // Page still switches language for the current visit if storage is blocked.
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-blog-language]");
    if (!button) return;
    event.preventDefault();
    applyLanguage(button.dataset.blogLanguage);
  });

  document.addEventListener("DOMContentLoaded", () => {
    applyLanguage(readLanguage());
  });
})();
