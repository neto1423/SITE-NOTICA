const REFRESH_INTERVAL = 60_000;
const APP_BASE_URL = new URL("./", document.currentScript.src);
const CARD_TEMPLATE_KEY = "giro360-instagram-card-template-v1";
const CARD_DIMENSIONS = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 }
};
const DEFAULT_CARD_TEMPLATE = {
  format: "feed",
  background: "#102447",
  textColor: "#ffffff",
  alignment: "center",
  titleSize: 68,
  imageHeight: 40,
  profile: "",
  imageX: 0.06,
  imageY: 0.035,
  titleX: 0.5,
  titleY: 0.47,
  summaryX: 0.5,
  summaryY: 0.74,
  logoX: 0.08,
  logoY: 0.91,
  signatureX: 0.5,
  signatureY: 0.91,
  logoData: "",
  assets: [],
  layerOrder: ["image", "title", "summary", "logo", "signature"]
};
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
  readerReturnFocus: null,
  cardArticle: null,
  cardTemplate: { ...DEFAULT_CARD_TEMPLATE },
  cardImageOverride: "",
  cardLogo: null,
  cardSelectedLayer: "image",
  cardDrag: null,
  cardRenderVersion: 0
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
  readerShare: document.querySelector("#reader-share-whatsapp"),
  cardStudio: document.querySelector("#card-studio"),
  cardSearch: document.querySelector("#card-news-search"),
  cardResults: document.querySelector("#card-news-results"),
  cardCanvas: document.querySelector("#card-preview"),
  cardBackground: document.querySelector("#card-background"),
  cardTextColor: document.querySelector("#card-text-color"),
  cardAlignment: document.querySelector("#card-alignment"),
  cardTitleSize: document.querySelector("#card-title-size"),
  cardImageHeight: document.querySelector("#card-image-height"),
  cardProfile: document.querySelector("#card-profile"),
  cardLogoUpload: document.querySelector("#card-logo-upload"),
  cardElementUpload: document.querySelector("#card-element-upload"),
  cardImageUpload: document.querySelector("#card-image-upload"),
  cardLayers: document.querySelector("#card-layer-list"),
  cardSave: document.querySelector("#card-save-template"),
  cardReset: document.querySelector("#card-reset-template"),
  cardDownload: document.querySelector("#card-download"),
  cardStatus: document.querySelector("#card-studio-status")
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

function cardImageUrlFor(article) {
  if (/^data\/card-images\/[a-f0-9]{64}\.(?:jpg|png|webp)$/i.test(article.cardImage || "")) {
    return new URL(article.cardImage, APP_BASE_URL).href;
  }
  return imageUrlFor(article);
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

function setCardStatus(message, isError = false) {
  elements.cardStatus.textContent = message;
  elements.cardStatus.dataset.error = String(isError);
}

function renderCardNewsResults() {
  if (!state.articles.length) {
    elements.cardResults.innerHTML = "<p>As notícias ainda estão carregando. Tente novamente em instantes.</p>";
    return;
  }
  const query = normalizeText(elements.cardSearch.value.trim());
  const matches = state.articles
    .filter((article) => !query || normalizeText(`${article.title} ${article.description} ${article.source}`).includes(query))
    .slice(0, 12);
  if (!matches.length) {
    elements.cardResults.innerHTML = "<p>Nenhuma notícia encontrada. Experimente outro termo.</p>";
    return;
  }
  elements.cardResults.innerHTML = matches.map((article, index) => `
    <button class="card-news-option${state.cardArticle?.link === article.link ? " is-selected" : ""}" type="button" data-card-article="${index}">
      <strong>${escapeHtml(article.title)}</strong>
      <span>${escapeHtml(article.source)} · ${escapeHtml(categoryFor(article))}</span>
    </button>
  `).join("");
}

function wrapCanvasText(context, text, maxWidth, maxLines) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    let lastLine = lines[maxLines - 1];
    while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) lastLine = lastLine.slice(0, -1);
    lines[maxLines - 1] = `${lastLine.trimEnd()}…`;
  }
  return lines;
}

function drawCardImageCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 24);
  context.clip();
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function cardTextAnchor(context, width, normalizedX) {
  const alignment = state.cardTemplate.alignment;
  if (alignment === "left") return { textAlign: "left", x: width * normalizedX };
  if (alignment === "right") return { textAlign: "right", x: width * normalizedX };
  return { textAlign: "center", x: width * normalizedX };
}

function cardLayerOrder() {
  const available = ["image", "title", "summary", "logo", ...(state.cardTemplate.assets || []).map((asset) => `asset:${asset.id}`), "signature"];
  const savedOrder = Array.isArray(state.cardTemplate.layerOrder) ? state.cardTemplate.layerOrder : [];
  return [...savedOrder.filter((layer, index) => available.includes(layer) && savedOrder.indexOf(layer) === index), ...available.filter((layer) => !savedOrder.includes(layer))];
}

function cardLayerLabel(layer) {
  if (layer === "image") return "Foto da notícia";
  if (layer === "title") return "Título";
  if (layer === "summary") return "Resumo";
  if (layer === "logo") return "Logo da marca";
  if (layer === "signature") return "Fonte e assinatura";
  const asset = state.cardTemplate.assets.find((item) => `asset:${item.id}` === layer);
  return asset ? asset.name : "Elemento enviado";
}

function renderCardLayers() {
  const order = cardLayerOrder();
  elements.cardLayers.innerHTML = order.map((layer, index) => `
    <li class="card-layer-row${layer === state.cardSelectedLayer ? " is-selected" : ""}">
      <button class="card-layer-select" type="button" data-card-layer="${escapeHtml(layer)}" aria-pressed="${layer === state.cardSelectedLayer}">
        <span>${escapeHtml(cardLayerLabel(layer))}</span><small>${index === 0 ? "Mais atrás" : index === order.length - 1 ? "Mais à frente" : `Camada ${index + 1}`}</small>
      </button>
      <button class="card-layer-move" type="button" data-card-layer-move="-1" data-card-layer="${escapeHtml(layer)}" aria-label="Enviar ${escapeHtml(cardLayerLabel(layer))} para trás" ${index === 0 ? "disabled" : ""}>↓</button>
      <button class="card-layer-move" type="button" data-card-layer-move="1" data-card-layer="${escapeHtml(layer)}" aria-label="Trazer ${escapeHtml(cardLayerLabel(layer))} para frente" ${index === order.length - 1 ? "disabled" : ""}>↑</button>
      ${layer.startsWith("asset:") ? `<button class="card-layer-remove" type="button" data-card-layer-remove="${escapeHtml(layer.slice(6))}" aria-label="Remover ${escapeHtml(cardLayerLabel(layer))}">×</button>` : ""}
    </li>
  `).join("");
}

function loadCardImage(source) {
  if (!source) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    if (!source.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function renderCardPreview() {
  const template = state.cardTemplate;
  const { width, height } = CARD_DIMENSIONS[template.format];
  const canvas = elements.cardCanvas;
  canvas.width = width;
  canvas.height = height;
  const version = ++state.cardRenderVersion;
  const article = state.cardArticle;
  const imageSource = state.cardImageOverride || (article ? cardImageUrlFor(article) : "");
  const assets = template.assets || [];
  const [photo, logo, ...assetImages] = await Promise.all([
    loadCardImage(imageSource),
    loadCardImage(template.logoData),
    ...assets.map((asset) => loadCardImage(asset.data))
  ]);
  if (version !== state.cardRenderVersion) return;
  const images = new Map(assets.map((asset, index) => [`asset:${asset.id}`, assetImages[index]]));
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.fillStyle = template.background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#4b83ff";
  context.fillRect(0, 0, width, 16);

  const textColor = template.textColor;
  const textWidth = width * 0.84;
  const title = article?.title || "Título da notícia selecionada";
  const titleFont = Number(template.titleSize);
  const titleAnchor = cardTextAnchor(context, width, template.titleX);
  const fullDescription = (article?.shareSummary || article?.description || "Resumo da notícia será exibido aqui.").trim();
  const description = fullDescription.length > 180 ? `${fullDescription.slice(0, 177).trimEnd()}…` : fullDescription;
  const summaryFont = Math.max(28, Math.round(titleFont * 0.49));
  const summaryAnchor = cardTextAnchor(context, width, template.summaryX);
  const signatureAnchor = cardTextAnchor(context, width, template.signatureX);
  const signature = [article?.source || "Fonte da notícia", template.profile.trim()].filter(Boolean).join("  ·  ");
  for (const layer of cardLayerOrder()) {
    if (layer === "image") {
      const imageX = width * template.imageX;
      const imageY = height * template.imageY;
      const imageWidth = width * 0.88;
      const imageHeight = height * template.imageHeight / 100;
      context.fillStyle = "#253a5b";
      context.beginPath();
      context.roundRect(imageX, imageY, imageWidth, imageHeight, 24);
      context.fill();
      if (photo) {
        drawCardImageCover(context, photo, imageX, imageY, imageWidth, imageHeight);
      } else {
        context.fillStyle = "#dbe7ff";
        context.font = "600 30px Arial, sans-serif";
        context.textAlign = "center";
        context.fillText(imageSource ? "Não foi possível carregar a foto" : "A foto da notícia aparecerá aqui", width / 2, imageY + imageHeight / 2);
      }
    } else if (layer === "title") {
      context.fillStyle = textColor;
      context.textAlign = titleAnchor.textAlign;
      context.font = `800 ${titleFont}px Arial, sans-serif`;
      const titleLines = wrapCanvasText(context, title, textWidth, template.format === "story" ? 4 : 3);
      const titleLineHeight = titleFont * 1.18;
      titleLines.forEach((line, index) => context.fillText(line, titleAnchor.x, height * template.titleY + titleFont + index * titleLineHeight, textWidth));
    } else if (layer === "summary") {
      context.fillStyle = textColor;
      context.globalAlpha = 0.88;
      context.textAlign = summaryAnchor.textAlign;
      context.font = `400 ${summaryFont}px Arial, sans-serif`;
      const summaryLines = wrapCanvasText(context, description, textWidth, 5);
      const summaryLineHeight = summaryFont * 1.4;
      const summaryTop = height * template.summaryY;
      summaryLines.forEach((line, index) => context.fillText(line, summaryAnchor.x, summaryTop + summaryFont + index * summaryLineHeight, textWidth));
      context.globalAlpha = 1;
    } else if (layer === "logo") {
      const logoX = width * template.logoX;
      const logoY = height * template.logoY;
      if (logo) {
        const scale = Math.min((width * 0.18) / logo.naturalWidth, (height * 0.08) / logo.naturalHeight, 1);
        context.drawImage(logo, logoX, logoY, logo.naturalWidth * scale, logo.naturalHeight * scale);
      } else {
        context.fillStyle = textColor;
        context.globalAlpha = 0.82;
        context.font = "800 25px Arial, sans-serif";
        context.textAlign = "left";
        context.fillText("GIRO 360", logoX, logoY + 28);
        context.globalAlpha = 1;
      }
    } else if (layer === "signature") {
      context.fillStyle = textColor;
      context.globalAlpha = 0.8;
      context.font = "600 24px Arial, sans-serif";
      context.textAlign = signatureAnchor.textAlign;
      context.fillText(signature, signatureAnchor.x, height * template.signatureY + 24, textWidth);
      context.globalAlpha = 1;
    } else {
      const asset = assets.find((item) => `asset:${item.id}` === layer);
      const image = images.get(layer);
      if (!asset || !image) continue;
      const assetWidth = width * asset.width;
      const assetHeight = assetWidth * image.naturalHeight / image.naturalWidth;
      context.drawImage(image, width * asset.x, height * asset.y, assetWidth, assetHeight);
    }
  }

  elements.cardDownload.disabled = !article;
  if (!article) {
    setCardStatus("Selecione uma notícia. Arraste os elementos para ajustar o layout.");
  } else if (imageSource && !photo) {
    setCardStatus("A foto da fonte não pode ser carregada aqui. Envie uma foto personalizada para incluí-la no PNG.", true);
  } else {
    setCardStatus("Prévia pronta. Arraste os elementos, salve o layout e baixe o PNG.");
  }
}

async function updateCardTemplateFromControls() {
  state.cardTemplate.background = elements.cardBackground.value;
  state.cardTemplate.textColor = elements.cardTextColor.value;
  state.cardTemplate.alignment = elements.cardAlignment.value;
  state.cardTemplate.titleSize = Number(elements.cardTitleSize.value);
  state.cardTemplate.imageHeight = Number(elements.cardImageHeight.value);
  state.cardTemplate.profile = elements.cardProfile.value;
  await renderCardPreview();
  setCardStatus("Layout alterado. Salve-o para reutilizar nos próximos cards.");
}

function applyCardTemplateToControls() {
  const template = state.cardTemplate;
  document.querySelector(`input[name="card-format"][value="${template.format}"]`).checked = true;
  elements.cardBackground.value = template.background;
  elements.cardTextColor.value = template.textColor;
  elements.cardAlignment.value = template.alignment;
  elements.cardTitleSize.value = template.titleSize;
  elements.cardImageHeight.value = template.imageHeight;
  elements.cardProfile.value = template.profile;
  renderCardLayers();
  renderCardPreview();
}

function loadSavedCardTemplate() {
  try {
    const saved = localStorage.getItem(CARD_TEMPLATE_KEY);
    if (!saved) return;
    const parsed = JSON.parse(saved);
    state.cardTemplate = { ...DEFAULT_CARD_TEMPLATE, ...parsed };
    if (!CARD_DIMENSIONS[state.cardTemplate.format]) state.cardTemplate.format = "feed";
    state.cardTemplate.assets = Array.isArray(parsed.assets)
      ? parsed.assets.filter((asset) => asset && typeof asset.id === "string" && typeof asset.data === "string").slice(0, 8)
      : [];
    state.cardTemplate.layerOrder = cardLayerOrder();
  } catch (error) {
    setCardStatus(`Não foi possível carregar o layout salvo: ${error.message}`, true);
  }
}

function saveCardTemplate() {
  try {
    localStorage.setItem(CARD_TEMPLATE_KEY, JSON.stringify(state.cardTemplate));
    setCardStatus("Layout, logo, elementos enviados e ordem das camadas salvos neste aparelho para os próximos cards.");
  } catch (error) {
    setCardStatus(`Não foi possível salvar. Reduza o tamanho das imagens enviadas e tente de novo. (${error.message})`, true);
  }
}

function imageFileToDataUrl(file, maxSize) {
  if (!file || !/^image\/(?:png|jpeg|webp)$/.test(file.type)) {
    return Promise.reject(new Error("Escolha uma imagem PNG, JPEG ou WebP."));
  }
  if (file.size > 12 * 1024 * 1024) {
    return Promise.reject(new Error("A imagem deve ter no máximo 12 MB."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("O arquivo selecionado não contém uma imagem válida."));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : file.type, 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function imageAspectRatio(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalHeight / image.naturalWidth);
    image.onerror = () => reject(new Error("Não foi possível carregar o elemento enviado."));
    image.src = source;
  });
}

function cardCanvasLayerAt(x, y) {
  const { width, height } = CARD_DIMENSIONS[state.cardTemplate.format];
  const template = state.cardTemplate;
  const contains = (left, top, boxWidth, boxHeight) => x >= left && x <= left + boxWidth && y >= top && y <= top + boxHeight;
  for (const layer of cardLayerOrder().reverse()) {
    if (layer === "image" && contains(width * template.imageX, height * template.imageY, width * 0.88, height * template.imageHeight / 100)) return layer;
    if (layer === "title" && contains(width * (template.titleX - 0.44), height * template.titleY, width * 0.88, height * 0.17)) return layer;
    if (layer === "summary" && contains(width * (template.summaryX - 0.44), height * template.summaryY, width * 0.88, height * 0.18)) return layer;
    if (layer === "logo" && contains(width * template.logoX - 20, height * template.logoY - 20, width * 0.25, height * 0.1)) return layer;
    if (layer === "signature" && contains(width * (template.signatureX - 0.44), height * template.signatureY - 20, width * 0.88, 60)) return layer;
    if (layer.startsWith("asset:")) {
      const asset = template.assets.find((item) => `asset:${item.id}` === layer);
      if (asset) {
        const assetWidth = width * asset.width;
        const assetHeight = assetWidth * asset.aspect * width / height;
        if (contains(width * asset.x, height * asset.y, assetWidth, assetHeight)) return layer;
      }
    }
  }
  return null;
}

function moveCardLayer(layer, direction) {
  const order = cardLayerOrder();
  const current = order.indexOf(layer);
  const next = current + direction;
  if (current < 0 || next < 0 || next >= order.length) return;
  [order[current], order[next]] = [order[next], order[current]];
  state.cardTemplate.layerOrder = order;
  state.cardSelectedLayer = layer;
  renderCardLayers();
  renderCardPreview();
  setCardStatus(`${cardLayerLabel(layer)} movido ${direction > 0 ? "para frente" : "para trás"}. Salve o layout para reutilizar esta ordem.`);
}

async function downloadCardImage() {
  if (!state.cardArticle) {
    setCardStatus("Selecione uma notícia antes de baixar o card.", true);
    return;
  }
  elements.cardDownload.disabled = true;
  setCardStatus("Gerando a imagem PNG…");
  try {
    await renderCardPreview();
    const blob = await new Promise((resolve) => elements.cardCanvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("O navegador não conseguiu exportar a imagem. Envie uma foto personalizada e tente novamente.");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const slug = normalizeText(state.cardArticle.title).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "noticia";
    anchor.href = url;
    anchor.download = `giro360-instagram-${state.cardTemplate.format}-${slug}.png`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setCardStatus("PNG baixado. Agora você pode publicá-lo no Instagram.");
  } catch (error) {
    setCardStatus(`Falha ao gerar o PNG: ${error.message}`, true);
  } finally {
    elements.cardDownload.disabled = !state.cardArticle;
  }
}

function setupCardStudio() {
  loadSavedCardTemplate();
  applyCardTemplateToControls();
  renderCardNewsResults();
  elements.cardSearch.addEventListener("input", renderCardNewsResults);
  elements.cardResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-card-article]");
    if (!button) return;
    const matches = state.articles.filter((article) => {
      const query = normalizeText(elements.cardSearch.value.trim());
      return !query || normalizeText(`${article.title} ${article.description} ${article.source}`).includes(query);
    }).slice(0, 12);
    state.cardArticle = matches[Number(button.dataset.cardArticle)] || null;
    state.cardImageOverride = "";
    elements.cardImageUpload.value = "";
    renderCardNewsResults();
    renderCardPreview();
  });
  document.querySelectorAll('input[name="card-format"]').forEach((input) => input.addEventListener("change", () => {
    state.cardTemplate.format = input.value;
    applyCardTemplateToControls();
    setCardStatus("Formato alterado. Salve o layout para usá-lo nos próximos cards.");
  }));
  [elements.cardBackground, elements.cardTextColor, elements.cardAlignment, elements.cardTitleSize, elements.cardImageHeight, elements.cardProfile]
    .forEach((control) => control.addEventListener("input", updateCardTemplateFromControls));
  elements.cardLogoUpload.addEventListener("change", async () => {
    const file = elements.cardLogoUpload.files[0];
    if (!file) return;
    try {
      state.cardTemplate.logoData = await imageFileToDataUrl(file, 700);
      await renderCardPreview();
      setCardStatus("Logo aplicado. Salve o layout para mantê-lo nos próximos cards.");
    } catch (error) {
      setCardStatus(error.message, true);
    }
  });
  elements.cardElementUpload.addEventListener("change", async () => {
    const files = [...elements.cardElementUpload.files];
    if (!files.length) return;
    try {
      const remaining = 8 - state.cardTemplate.assets.length;
      if (files.length > remaining) throw new Error(`Você pode salvar até 8 elementos de imagem. Há espaço para mais ${remaining}.`);
      for (const file of files) {
        const data = await imageFileToDataUrl(file, 900);
        const aspect = await imageAspectRatio(data);
        const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const asset = {
          id,
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Elemento",
          data,
          x: 0.38,
          y: 0.82,
          width: 0.24,
          aspect
        };
        state.cardTemplate.assets.push(asset);
        state.cardTemplate.layerOrder = [...cardLayerOrder().filter((layer) => layer !== `asset:${id}`), `asset:${id}`];
        state.cardSelectedLayer = `asset:${id}`;
      }
      renderCardLayers();
      await renderCardPreview();
      setCardStatus("Elementos adicionados. Arraste-os no card, ajuste a ordem das camadas e salve o layout para reutilizá-los.");
    } catch (error) {
      setCardStatus(error.message, true);
    } finally {
      elements.cardElementUpload.value = "";
    }
  });
  elements.cardImageUpload.addEventListener("change", async () => {
    const file = elements.cardImageUpload.files[0];
    if (!file) return;
    try {
      state.cardImageOverride = await imageFileToDataUrl(file, 1400);
      await renderCardPreview();
      setCardStatus("Foto personalizada aplicada apenas a este card. Para os próximos, selecione outra notícia ou envie outra foto.");
    } catch (error) {
      setCardStatus(error.message, true);
    }
  });
  elements.cardSave.addEventListener("click", saveCardTemplate);
  elements.cardReset.addEventListener("click", () => {
    state.cardTemplate = { ...DEFAULT_CARD_TEMPLATE };
    state.cardImageOverride = "";
    state.cardSelectedLayer = "image";
    try {
      localStorage.removeItem(CARD_TEMPLATE_KEY);
    } catch (error) {
      setCardStatus(`Não foi possível remover o layout salvo: ${error.message}`, true);
      return;
    }
    applyCardTemplateToControls();
    elements.cardLogoUpload.value = "";
    elements.cardElementUpload.value = "";
    elements.cardImageUpload.value = "";
    setCardStatus("Layout padrão restaurado. Salve-o se quiser mantê-lo para os próximos cards.");
  });
  elements.cardDownload.addEventListener("click", downloadCardImage);
  elements.cardLayers.addEventListener("click", (event) => {
    const moveButton = event.target.closest("[data-card-layer-move]");
    if (moveButton) {
      moveCardLayer(moveButton.dataset.cardLayer, Number(moveButton.dataset.cardLayerMove));
      return;
    }
    const removeButton = event.target.closest("[data-card-layer-remove]");
    if (removeButton) {
      const layer = `asset:${removeButton.dataset.cardLayerRemove}`;
      state.cardTemplate.assets = state.cardTemplate.assets.filter((asset) => `asset:${asset.id}` !== layer);
      state.cardTemplate.layerOrder = cardLayerOrder().filter((item) => item !== layer);
      if (state.cardSelectedLayer === layer) state.cardSelectedLayer = "image";
      renderCardLayers();
      renderCardPreview();
      setCardStatus("Elemento removido. Salve o layout para registrar a alteração.");
      return;
    }
    const selectButton = event.target.closest("[data-card-layer]");
    if (selectButton) {
      state.cardSelectedLayer = selectButton.dataset.cardLayer;
      renderCardLayers();
    }
  });
  elements.cardCanvas.addEventListener("pointerdown", (event) => {
    const bounds = elements.cardCanvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (elements.cardCanvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (elements.cardCanvas.height / bounds.height);
    const layer = cardCanvasLayerAt(x, y);
    if (!layer) return;
    state.cardSelectedLayer = layer;
    renderCardLayers();
    state.cardDrag = {
      layer,
      pointerId: event.pointerId,
      startX: x,
      startY: y,
      template: { ...state.cardTemplate, assets: state.cardTemplate.assets.map((asset) => ({ ...asset })) }
    };
    elements.cardCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  elements.cardCanvas.addEventListener("pointermove", (event) => {
    if (!state.cardDrag || state.cardDrag.pointerId !== event.pointerId) return;
    const bounds = elements.cardCanvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (elements.cardCanvas.width / bounds.width);
    const y = (event.clientY - bounds.top) * (elements.cardCanvas.height / bounds.height);
    const dx = (x - state.cardDrag.startX) / elements.cardCanvas.width;
    const dy = (y - state.cardDrag.startY) / elements.cardCanvas.height;
    const { layer, template } = state.cardDrag;
    if (layer.startsWith("asset:")) {
      const asset = state.cardTemplate.assets.find((item) => `asset:${item.id}` === layer);
      const startingAsset = template.assets.find((item) => item.id === asset?.id);
      if (!asset || !startingAsset) return;
      asset.x = Math.min(0.98 - asset.width, Math.max(0.02, startingAsset.x + dx));
      asset.y = Math.min(0.98 - asset.width * asset.aspect * elements.cardCanvas.width / elements.cardCanvas.height, Math.max(0.02, startingAsset.y + dy));
    } else if (layer === "image" || layer === "logo") {
      state.cardTemplate[`${layer}X`] = Math.min(0.9, Math.max(0.02, template[`${layer}X`] + dx));
      state.cardTemplate[`${layer}Y`] = Math.min(0.94, Math.max(0.02, template[`${layer}Y`] + dy));
    } else {
      state.cardTemplate[`${layer}X`] = Math.min(0.94, Math.max(0.06, template[`${layer}X`] + dx));
      state.cardTemplate[`${layer}Y`] = Math.min(0.94, Math.max(0.03, template[`${layer}Y`] + dy));
    }
    renderCardPreview();
  });
  const stopCardDrag = () => { state.cardDrag = null; };
  elements.cardCanvas.addEventListener("pointerup", stopCardDrag);
  elements.cardCanvas.addEventListener("pointercancel", stopCardDrag);
  document.querySelector("#bottom-cards").addEventListener("click", () => {
    elements.cardStudio.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
    renderCardNewsResults();
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
setupCardStudio();
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
