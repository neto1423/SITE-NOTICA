const REFRESH_INTERVAL = 60_000;
const APP_BASE_URL = new URL("./", document.currentScript.src);
const ZONA_DA_MATA_TERMS = [
  "zona da mata", "murici", "união dos palmares", "uniao dos palmares", "branquinha",
  "santana do mundaú", "santana do mundau", "são josé da laje", "sao jose da laje",
  "ibateguara", "joaquim gomes", "flexeiras", "messias", "capela", "cajueiro",
  "atalaia", "chã preta", "cha preta", "colônia leopoldina", "colonia leopoldina"
];
const FALLBACK_ART = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 36 18 22l7 8 6-7 10 13H7Z"></path><circle cx="32" cy="15" r="4"></circle><path d="M5 8v32h38V8H5Z"></path></svg>';
const state = {
  category: "all",
  articles: [],
  visibleArticles: [],
  hasLoadedData: false,
  loading: false,
  installedPrompt: null,
  readerReturnFocus: null
};

const elements = {
  feed: document.querySelector("#feed-grid"),
  loading: document.querySelector("#loading-state"),
  empty: document.querySelector("#empty-state"),
  updated: document.querySelector("#last-updated"),
  error: document.querySelector("#error-banner"),
  refresh: document.querySelector("#refresh-button"),
  refreshLabel: document.querySelector("#refresh-label"),
  notificationToggle: document.querySelector("#notification-toggle"),
  notificationLabel: document.querySelector("#notification-label"),
  alertStatus: document.querySelector("#alert-status"),
  searchToggle: document.querySelector("#search-toggle"),
  searchPanel: document.querySelector("#search-panel"),
  searchInput: document.querySelector("#search-input"),
  installButton: document.querySelector("#install-button"),
  reader: document.querySelector("#article-reader"),
  readerClose: document.querySelector("#reader-close"),
  readerMedia: document.querySelector("#reader-media"),
  readerCategory: document.querySelector("#reader-category"),
  readerTitle: document.querySelector("#reader-title"),
  readerSource: document.querySelector("#reader-source"),
  readerTime: document.querySelector("#reader-time"),
  readerBody: document.querySelector("#reader-body"),
  readerOriginal: document.querySelector("#reader-original"),
  readerShare: document.querySelector("#reader-share-whatsapp")
};

function normalizeText(value = "") {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeVideoUrl(value) {
  const url = safeUrl(value);
  if (!url) return "";
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") return "";
  const { hostname } = parsedUrl;
  if (/\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(parsedUrl.href)) return url;
  return ["www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"].includes(hostname) ? url : "";
}

function isZonaDaMata(article) {
  const haystack = normalizeText(`${article.title} ${article.description}`);
  return ZONA_DA_MATA_TERMS.some((term) => haystack.includes(normalizeText(term)));
}

function isAlagoasArticle(article) {
  const haystack = normalizeText(`${article.title} ${article.description} ${article.link}`);
  return ["alagoas", "maceio", "arapiraca", "rio largo", "palmeira dos indios"].some((term) => haystack.includes(term))
    || /g1\.globo\.com\/al\//i.test(article.link);
}

function categoryFor(article) {
  if (article.feed === "mata" || isZonaDaMata(article)) return "Zona da Mata";
  if (article.feed === "alagoas" || isAlagoasArticle(article)) return "Alagoas";
  return "Brasil";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function storyId(article) {
  return article.link;
}

function imageUrlFor(article) {
  const image = safeUrl(article.image);
  if (image) return image;
  const video = safeVideoUrl(article.video);
  const youtubeId = video?.match(/youtube-nocookie\.com\/embed\/([\w-]+)/)?.[1];
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "";
}

function whatsappShareUrl(article) {
  const title = article.title.trim();
  const summary = (article.shareSummary || article.description || "").trim().slice(0, 500);
  const link = safeUrl(article.link);
  const image = imageUrlFor(article);
  const lines = [
    `📰 ${title}`,
    summary ? `\n${summary}` : "",
    link ? `\nLeia a matéria: ${link}` : "",
    image ? `\nImagem: ${image}` : ""
  ].filter(Boolean);
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function refreshNews() {
  if (state.loading) return;
  state.loading = true;
  elements.refresh.classList.add("is-loading");
  elements.refresh.disabled = true;
  elements.refreshLabel.textContent = "Buscando…";
  elements.feed.setAttribute("aria-busy", "true");
  if (!state.articles.length) elements.loading.hidden = false;
  elements.error.hidden = true;
  try {
    const feedUrl = new URL("data/latest-news.json", APP_BASE_URL);
    feedUrl.searchParams.set("check", Date.now());
    const response = await fetch(feedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      const reason = response.status === 404
        ? "O arquivo de notícias não foi encontrado no site publicado. No GitHub, confirme em Settings → Pages que a origem é GitHub Actions e verifique se “Atualizar notícias e publicar” terminou com sucesso na branch padrão."
        : `Não foi possível carregar o feed publicado (${response.status}).`;
      throw new Error(reason);
    }
    const snapshot = await response.json();
    if (!snapshot || !Array.isArray(snapshot.articles)) {
      throw new Error("O arquivo de notícias publicado está em um formato inválido.");
    }
    const previousIds = new Set(state.articles.map(storyId));
    const unique = new Map();
    for (const article of snapshot.articles) {
      const link = safeUrl(article?.link);
      if (typeof article?.title !== "string" || !link) continue;
      const normalized = { ...article, link, published: article.published || snapshot.updatedAt || new Date().toISOString() };
      if (!unique.has(storyId(normalized))) unique.set(storyId(normalized), normalized);
    }
    const nextArticles = Array.from(unique.values()).sort((a, b) => new Date(b.published) - new Date(a.published));
    const newArticles = nextArticles.filter((article) => !previousIds.has(storyId(article)));
    if (previousIds.size) await notifyNewArticles(newArticles);
    state.articles = nextArticles;
    state.hasLoadedData = true;
    const sourceUpdatedAt = snapshot.updatedAt ? formatTime(snapshot.updatedAt) : "ainda não publicados";
    elements.updated.textContent = `Conferido às ${formatTime(new Date())} · portais atualizados ${sourceUpdatedAt} · próxima checagem em 1 min`;
  } catch (error) {
    elements.error.textContent = `${error.message} Confira sua conexão e tente atualizar novamente.`;
    elements.error.hidden = false;
    elements.updated.textContent = `Última tentativa às ${formatTime(new Date())}`;
  } finally {
    state.loading = false;
    elements.loading.hidden = true;
    elements.refresh.classList.remove("is-loading");
    elements.refresh.disabled = false;
    elements.refreshLabel.textContent = "Atualizar";
    elements.feed.setAttribute("aria-busy", "false");
    renderNews();
  }
}

function currentArticles() {
  const query = normalizeText(elements.searchInput.value.trim());
  const articles = state.articles.filter((article) => {
    const categoryMatch = state.category === "all"
      || (state.category === "mata" && (article.feed === "mata" || isZonaDaMata(article)))
      || (state.category === "alagoas" && (article.feed === "alagoas" || isAlagoasArticle(article)))
      || (state.category === "brasil" && article.feed === "brasil" && !isAlagoasArticle(article) && !isZonaDaMata(article));
    const searchMatch = !query || normalizeText(`${article.title} ${article.description} ${article.source}`).includes(query);
    return categoryMatch && searchMatch;
  });
  if (state.category === "mata") {
    articles.sort((left, right) => Number(Boolean(right.image || right.video)) - Number(Boolean(left.image || left.video)) || new Date(right.published) - new Date(left.published));
  }
  return articles;
}

function imageMarkup(article) {
  const image = imageUrlFor(article);
  if (!image) return `<span class="story-image-fallback">${FALLBACK_ART}</span>`;
  return `<img class="story-image" src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
}

function readerMediaMarkup(article) {
  const video = safeVideoUrl(article.video);
  if (video && /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(video)) {
    return `<video class="reader-video" src="${escapeHtml(video)}" title="${escapeHtml(article.title)}" controls playsinline preload="metadata"></video>`;
  }
  if (video) {
    return `<iframe class="reader-video" src="${escapeHtml(video)}" title="${escapeHtml(article.title)}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }
  return imageMarkup(article);
}

function watchImageErrors(container) {
  container.querySelectorAll(".story-image").forEach((image) => {
    image.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = "story-image-fallback";
      fallback.innerHTML = FALLBACK_ART;
      image.replaceWith(fallback);
    }, { once: true });
  });
}

function openArticle(article, trigger) {
  if (!article) return;
  const link = safeUrl(article.link);
  elements.readerCategory.textContent = categoryFor(article);
  elements.readerTitle.textContent = article.title;
  elements.readerSource.textContent = article.source;
  elements.readerTime.textContent = formatTime(article.published);
  elements.readerMedia.innerHTML = readerMediaMarkup(article);
  watchImageErrors(elements.readerMedia);
  elements.readerBody.textContent = (article.shareSummary || article.description)?.trim()
    || "Ainda não há um resumo disponível para esta notícia.";
  elements.readerOriginal.href = link;
  elements.readerOriginal.hidden = !link;
  elements.readerShare.href = whatsappShareUrl(article);
  state.readerReturnFocus = trigger || document.activeElement;
  elements.reader.hidden = false;
  document.querySelector(".app-shell").inert = true;
  document.body.classList.add("reader-open");
  elements.readerClose.focus();
  if (location.hash !== "#materia") history.pushState({ giroReader: true }, "", "#materia");
}

function closeArticle() {
  if (elements.reader.hidden) return;
  elements.reader.hidden = true;
  elements.readerMedia.replaceChildren();
  document.querySelector(".app-shell").inert = false;
  document.body.classList.remove("reader-open");
  state.readerReturnFocus?.focus?.();
  state.readerReturnFocus = null;
}

function handleReaderClose() {
  if (history.state?.giroReader && location.hash === "#materia") {
    history.back();
  } else {
    closeArticle();
  }
}

function renderNews() {
  const articles = currentArticles();
  state.visibleArticles = articles.slice(0, 60);
  elements.feed.innerHTML = state.visibleArticles.map((article, index) => {
    const link = safeUrl(article.link);
    const hasVideo = Boolean(safeVideoUrl(article.video));
    const mediaClass = state.category === "mata" && (article.image || hasVideo) ? " mata-media-card" : "";
    return `<article class="news-card${mediaClass}" data-story-index="${index}">
      <button class="story-cover" type="button" data-open-story="${index}" aria-label="Ler matéria: ${escapeHtml(article.title)}">
        <span class="story-image-wrap">
        ${imageMarkup(article)}
        <span class="story-category">${escapeHtml(categoryFor(article))}</span>
        ${hasVideo ? '<span class="story-video" aria-label="Vídeo"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 8 5-8 5V3Z"></path></svg></span>' : ""}
        </span>
      </button>
      <div class="story-content">
        <div class="story-meta"><span class="story-source">${escapeHtml(article.source)}</span><time>${escapeHtml(formatTime(article.published))}</time></div>
        <h3><button class="story-title" type="button" data-open-story="${index}">${escapeHtml(article.title)}</button></h3>
        ${article.description ? `<p class="story-description">${escapeHtml(article.description)}</p>` : ""}
        <div class="story-footer">
          <button class="read-link" type="button" data-open-story="${index}">Ler matéria ↗</button>
          <a class="story-share" href="${escapeHtml(whatsappShareUrl(article))}" target="_blank" rel="noopener noreferrer" aria-label="Compartilhar ${escapeHtml(article.title)} no WhatsApp">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 11.7a8.4 8.4 0 0 1-12.4 7.4L3 20l.9-4.8A8.4 8.4 0 1 1 20.4 11.7Z"></path><path d="M8 8.1c.2-.4.4-.4.7-.4h.4c.2 0 .3.1.4.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.2.2-.2.3-.1.5.6 1 1.4 1.8 2.5 2.3.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.4 0 .2-.1 1-.6 1.4-.5.5-1.4.7-2 .6-.6-.1-1.5-.4-2.5-.9a9.4 9.4 0 0 1-3.5-3.1c-.9-1.2-1.2-2.2-1.3-2.7-.1-.6.2-1.2.5-1.5Z"></path></svg>
            <span>WhatsApp</span>
          </a>
          ${link ? `<a class="source-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${escapeHtml(article.source)} em uma nova aba">Portal original ↗</a>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");
  watchImageErrors(elements.feed);
  elements.empty.hidden = articles.length !== 0 || !state.hasLoadedData;
}

function setCategory(category) {
  state.category = category;
  elements.feed.classList.toggle("is-mata", category === "mata");
  document.querySelectorAll(".category-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.category === category);
  });
  document.querySelectorAll(".bottom-link[data-category]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.category === category);
  });
  const names = { all: "Agora no Giro", mata: "Zona da Mata", alagoas: "Alagoas", brasil: "Brasil" };
  document.querySelector("#stories-heading").textContent = names[category];
  renderNews();
  document.querySelector("#stories-heading").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateNotificationControls(enabled) {
  elements.notificationToggle.setAttribute("aria-pressed", String(enabled));
  elements.notificationLabel.textContent = enabled ? "Ativado" : "Ativar";
  elements.alertStatus.textContent = enabled
    ? "Alertas ativos: avisaremos quando surgirem notícias novas."
    : "Ative as notificações para receber alertas enquanto acompanha o Giro.";
  localStorage.setItem("giro360-notifications", String(enabled));
}

async function setNotificationsEnabled() {
  if (localStorage.getItem("giro360-notifications") === "true") {
    updateNotificationControls(false);
    return;
  }
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    elements.alertStatus.textContent = "Este navegador não oferece notificações web. Tente instalar o Giro pelo Safari no iPhone.";
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    elements.alertStatus.textContent = "Permissão não concedida. Autorize as notificações nas configurações do navegador e tente novamente.";
    updateNotificationControls(false);
    return;
  }
  updateNotificationControls(true);
  if (!state.articles.length) await refreshNews();
}

async function notifyNewArticles(articles) {
  if (!articles.length || localStorage.getItem("giro360-notifications") !== "true" || Notification.permission !== "granted") return;
  const registration = await navigator.serviceWorker.ready;
  const categories = [...new Set(articles.map(categoryFor))];
  const title = categories.length === 1 && categories[0] === "Zona da Mata"
    ? "Novidade na Zona da Mata"
    : categories.length === 1 ? `Novidades · ${categories[0]}` : "Novidades no Giro 360";
  const headlines = articles.slice(0, 2).map((article) => article.title).join(" · ");
  const remainder = articles.length > 2 ? ` · +${articles.length - 2} notícias` : "";
  await registration.showNotification(title, {
    body: `${headlines}${remainder}`.slice(0, 220),
    icon: "./icon.svg",
    badge: "./icon.svg",
    tag: `giro360-${storyId(articles[0])}`,
    data: { url: articles[0].link }
  });
}

function setupInstallPrompt() {
  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isAppleMobile) elements.installButton.hidden = false;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installedPrompt = event;
    elements.installButton.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    state.installedPrompt = null;
    elements.installButton.hidden = true;
  });
  elements.installButton.addEventListener("click", async () => {
    if (state.installedPrompt) {
      state.installedPrompt.prompt();
      await state.installedPrompt.userChoice;
      state.installedPrompt = null;
      elements.installButton.hidden = true;
      return;
    }
    if (isAppleMobile) {
      elements.alertStatus.textContent = "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Abra o ícone instalado para ativar os alertas.";
      document.querySelector(".alert-card").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

document.querySelectorAll(".category-tab, .bottom-link[data-category]").forEach((button) => {
  button.addEventListener("click", () => setCategory(button.dataset.category));
});
elements.refresh.addEventListener("click", refreshNews);
elements.searchToggle.addEventListener("click", () => {
  const isHidden = elements.searchPanel.hidden;
  elements.searchPanel.hidden = !isHidden;
  elements.searchToggle.setAttribute("aria-expanded", String(isHidden));
  if (isHidden) elements.searchInput.focus();
});
elements.searchInput.addEventListener("input", renderNews);
elements.notificationToggle.addEventListener("click", setNotificationsEnabled);
document.querySelector("#bottom-alerts").addEventListener("click", () => {
  document.querySelector(".alert-card").scrollIntoView({ behavior: "smooth", block: "center" });
});
setupInstallPrompt();
document.querySelector("#whatsapp-link").href = `https://wa.me/?text=${encodeURIComponent(`Confira o Giro 360, sua central de notícias: ${location.href}`)}`;
elements.feed.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const trigger = event.target.closest("[data-open-story]");
  const card = event.target.closest(".news-card[data-story-index]");
  if (!trigger && !card) return;
  const index = Number(trigger?.dataset.openStory ?? card?.dataset.storyIndex);
  const article = state.visibleArticles[index];
  openArticle(article, trigger);
});
elements.readerClose.addEventListener("click", handleReaderClose);
window.addEventListener("popstate", () => {
  if (!elements.reader.hidden) closeArticle();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.reader.hidden) handleReaderClose();
});

if (localStorage.getItem("giro360-notifications") === "true" && "Notification" in window && Notification.permission === "granted") {
  elements.notificationToggle.setAttribute("aria-pressed", "true");
  elements.notificationLabel.textContent = "Ativado";
  elements.alertStatus.textContent = "Alertas ativos: avisaremos quando surgirem notícias novas.";
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    elements.alertStatus.textContent = `Não foi possível preparar o app offline: ${error.message}`;
  });
}

refreshNews();
window.setInterval(refreshNews, REFRESH_INTERVAL);
