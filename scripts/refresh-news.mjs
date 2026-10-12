import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "data", "latest-news.json");
const discoveredVideosPath = resolve(root, "data", "discovered-videos.json");
const cardImagesPath = resolve(root, "data", "card-images");
await mkdir(dirname(outputPath), { recursive: true });
await mkdir(cardImagesPath, { recursive: true });

const directFeeds = [
  { key: "alagoas", source: "TNH1", url: "https://www.tnh1.com.br/feed/" },
  { key: "alagoas", source: "Gazetaweb (Alagoas)", url: "https://www.gazetaweb.com/feed/" },
  { key: "alagoas", source: "7Segundos", url: "https://www.7segundos.com.br/rss" },
  { key: "alagoas", source: "G1 Alagoas", url: "https://g1.globo.com/rss/g1/al/alagoas/" },
  { key: "brasil", source: "G1 Brasil", url: "https://g1.globo.com/rss/g1/" },
  { key: "brasil", source: "CNN Brasil", url: "https://www.cnnbrasil.com.br/feed/" },
  { key: "brasil", source: "Folha", url: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { key: "brasil", source: "BBC News Brasil", url: "https://feeds.bbci.co.uk/portuguese/rss.xml" },
  { key: "brasil", source: "Agência Brasil", url: "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml" },
  { key: "brasil", source: "Poder360", url: "https://www.poder360.com.br/feed/" },
  { key: "brasil", source: "UOL", url: "https://rss.uol.com.br/feed/noticias.xml" },
  { key: "brasil", source: "O Globo", url: "https://oglobo.globo.com/rss.xml" },
  { key: "brasil", source: "Estadão", url: "https://www.estadao.com.br/arc/outboundfeeds/rss/?outputType=xml" },
  { key: "brasil", source: "Metrópoles", url: "https://www.metropoles.com/feed" },
  { key: "brasil", source: "InfoMoney", url: "https://www.infomoney.com.br/feed/" },
  { key: "brasil", source: "Terra", url: "https://www.terra.com.br/rss.xml" }
];
const portalsAlagoas = [
  "tnh1.com.br",
  "gazetaweb.com",
  "7segundos.com.br",
  "cadaminuto.com.br",
  "alagoas24horas.com.br",
  "g1.globo.com/al",
  "tribunahoje.com",
  "jaenoticia.com.br",
  "aquiacontece.com.br",
  "alagoasweb.com",
  "correiodosmunicipios-al.com.br",
  "minutoarapiraca.com.br",
  "alagoasnt.com.br"
];
const portalsBrasil = [
  "g1.globo.com",
  "cnnbrasil.com.br",
  "uol.com.br",
  "folha.uol.com.br",
  "bbc.com/portuguese",
  "agenciabrasil.ebc.com.br",
  "poder360.com.br",
  "oglobo.globo.com",
  "estadao.com.br",
  "metropoles.com",
  "r7.com",
  "terra.com.br",
  "infomoney.com.br",
  "valor.globo.com",
  "jovempan.com.br",
  "sbtnews.com.br",
  "nexojornal.com.br",
  "brasildefato.com.br",
  "agenciapublica.org.br"
];
function portalSearchFeeds(key, category, portals, region) {
  const groupSize = 4;
  return Array.from({ length: Math.ceil(portals.length / groupSize) }, (_, index) => {
    const group = portals.slice(index * groupSize, (index + 1) * groupSize);
    return {
      key,
      category,
      query: `(${group.map((portal) => `site:${portal}`).join(" OR ")}) ${region}`
    };
  });
}

const searchFeeds = [
  ...portalSearchFeeds("alagoas", "Alagoas", portalsAlagoas, "Alagoas"),
  ...portalSearchFeeds("brasil", "Brasil", portalsBrasil, "Brasil"),
  {
    key: "mata",
    category: "Zona da Mata",
    query: '("Zona da Mata" OR Murici OR "União dos Palmares" OR Branquinha OR "Santana do Mundaú" OR "São José da Laje" OR Ibateguara OR "Joaquim Gomes" OR Flexeiras OR Messias OR Capela OR Cajueiro OR Atalaia OR "Chã Preta") Alagoas'
  }
];
const feeds = [...directFeeds, ...searchFeeds];

function decodeXml(value) {
  let decoded = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const entityPattern = /&#x([0-9a-f]+);|&#(\d+);|&quot;|&apos;|&#39;|&lt;|&gt;|&amp;/gi;
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded.replace(entityPattern, (entity, hex, decimal) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(Number(decimal));
      return ({
        "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&"
      })[entity.toLowerCase()] || entity;
    });
  }
  return decoded;
}

function repairMojibake(value) {
  if (!/(?:Ã[\u0080-\u00ff]|Â[\u0080-\u00ff]|â€|ðŸ)/.test(value)) return value;
  const windows1252Bytes = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
    "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
    "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
    "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f
  };
  try {
    const bytes = Uint8Array.from(Array.from(value, (character) => (
      windows1252Bytes[character] ?? character.codePointAt(0)
    )));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

function decodeFeedResponse(response) {
  return response.arrayBuffer().then((buffer) => {
    const headerCharset = response.headers.get("content-type")?.match(/charset=["']?([^;"'\s]+)/i)?.[1];
    const xmlHeader = Buffer.from(buffer).subarray(0, 200).toString("latin1").match(/<\?xml[^>]*encoding=["']([^"']+)/i)?.[1];
    const declaredCharset = (headerCharset || xmlHeader || "utf-8").toLowerCase();
    try {
      if (declaredCharset !== "utf-8" && declaredCharset !== "utf8") {
        return new TextDecoder(declaredCharset).decode(buffer);
      }
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return new TextDecoder("windows-1252").decode(buffer);
    }
  });
}

function cleanSummary(value, maxLength = 480) {
  const summary = repairMojibake(decodeXml(value))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:none|null|undefined|n\/a)$/i.test(summary) ? "" : summary.slice(0, maxLength);
}

function getTag(xml, name) {
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${safeName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeName}\\s*>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function getAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return tag.match(new RegExp(`\\b${escapedName}=["']([^"']+)["']`, "i"))?.[1] || "";
}

function getImage(xml) {
  const mediaTags = xml.match(/<(?:media:thumbnail|media:content|enclosure)\b[^>]*>/gi) || [];
  const candidates = mediaTags.filter((tag) => {
    const type = getAttribute(tag, "type").toLowerCase();
    const medium = getAttribute(tag, "medium").toLowerCase();
    return /media:thumbnail/i.test(tag) || medium === "image" || type.startsWith("image/");
  }).map((tag) => getAttribute(tag, "url"));
  const encodedDescription = decodeXml(getTag(xml, "description"));
  const encodedContent = decodeXml(getTag(xml, "content:encoded"));
  candidates.push(
    encodedDescription.match(/<img[^>]+\bsrc=["']([^"']+)/i)?.[1],
    encodedContent.match(/<img[^>]+\bsrc=["']([^"']+)/i)?.[1]
  );
  return candidates.map((value) => value && decodeXml(value)).find((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }) || "";
}

function getVideoEmbed(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.slice(1);
      return /^[\w-]{6,20}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : "";
    }
    if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
      const videoId = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.split("/").pop();
      return videoId && /^[\w-]{6,20}$/.test(videoId) ? `https://www.youtube-nocookie.com/embed/${videoId}` : "";
    }
    if (["www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"].includes(url.hostname)) return url.href;
    return "";
  } catch {
    return "";
  }
}

function parseFeed(xml, feed) {
  if (!xml.includes("<rss")) throw new Error("Resposta sem estrutura RSS.");
  return Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item\s*>/gi), ([, item]) => {
    const title = repairMojibake(getTag(item, "title").replace(/<[^>]*>/g, "").trim());
    const link = getTag(item, "link").trim();
    const source = repairMojibake(getTag(item, "source").replace(/<[^>]*>/g, "").trim());
    const rawDescription = getTag(item, "description");
    const description = cleanSummary(rawDescription, 280);
    if (!title || !link || !/^https:\/\//i.test(link)) return null;
    const videoTag = (item.match(/<(?:media:content|media:player|enclosure)\b[^>]*>/gi) || []).find((tag) => {
      const type = getAttribute(tag, "type").toLowerCase();
      const medium = getAttribute(tag, "medium").toLowerCase();
      const url = getAttribute(tag, "url").toLowerCase();
      return medium === "video" || type.startsWith("video/") || /(?:youtube(?:-nocookie)?\.com|youtu\.be|player\.vimeo\.com)/.test(url);
    });
    const rawVideoUrl = videoTag ? decodeXml(getAttribute(videoTag, "url")) : "";
    const videoEmbed = getVideoEmbed(rawVideoUrl);
    const videoUrl = videoEmbed || (/^https:\/\//i.test(rawVideoUrl) && /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(rawVideoUrl) ? rawVideoUrl : "");
    const isVideoFile = /\.(?:mp4|webm|m3u8)(?:$|[?#])/i.test(videoUrl);
    return {
      title,
      description,
      link,
      image: getImage(item),
      shareSummary: description,
      video: videoUrl,
      videoType: isVideoFile ? "file" : "embed",
      source: source || feed.source,
      published: getTag(item, "pubDate") || new Date().toISOString(),
      feed: feed.key,
      category: feed.category
    };
  }).filter(Boolean);
}

function normalizedTitle(value) {
  return value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const ARTICLE_PAGE_HOSTS = [
  "tnh1.com.br", "gazetaweb.com", "7segundos.com.br", "g1.globo.com", "cnnbrasil.com.br",
  "folha.uol.com.br", "bbc.com", "bbci.co.uk", "agenciabrasil.ebc.com.br",
  "poder360.com.br", "uol.com.br", "oglobo.globo.com", "estadao.com.br",
  "metropoles.com", "infomoney.com.br", "terra.com.br", "tribunahoje.com",
  "jaenoticia.com.br", "aquiacontece.com.br", "alagoasweb.com"
];

function readMetaContent(html, propertyName) {
  const expectedName = new RegExp(`(?:property|name)=["']${propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i");
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!expectedName.test(tag)) continue;
    const content = tag.match(/\bcontent=["']([^"']+)["']/i)?.[1];
    if (content) return decodeXml(content);
  }
  return "";
}

function allowedArticleHost(hostname) {
  return ARTICLE_PAGE_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

async function enrichShareMetadata(articles) {
  const quotas = { mata: 8, alagoas: 8, brasil: 8 };
  const selected = [];
  for (const article of articles) {
    const host = new URL(article.link).hostname.toLowerCase();
    if (!allowedArticleHost(host) || !["mata", "alagoas", "brasil"].includes(article.feed)) continue;
    if (article.description && article.image) continue;
    if (selected.filter((item) => item.feed === article.feed).length >= quotas[article.feed]) continue;
    selected.push(article);
    if (selected.length >= 24) break;
  }
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (index < selected.length) {
      const article = selected[index++];
      try {
        const response = await fetch(article.link, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Giro360News/1.0)", Accept: "text/html" },
          signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok) {
          console.warn(`Metadados indisponíveis para ${article.source}: HTTP ${response.status}`);
          continue;
        }
        const html = await decodeFeedResponse(response);
        const summary = cleanSummary(
          readMetaContent(html, "og:description")
          || readMetaContent(html, "description")
          || readMetaContent(html, "twitter:description")
        );
        const image = readMetaContent(html, "og:image") || readMetaContent(html, "twitter:image");
        if (!article.shareSummary && summary) article.shareSummary = summary;
        if (!article.description && summary) article.description = summary.slice(0, 280);
        if (!article.image && /^https:\/\//i.test(image)) article.image = image;
      } catch (error) {
        console.warn(`Não foi possível buscar metadados de ${article.source}: ${error.message}`);
      }
    }
  }));
}

function isZonaDaMataVideo(video, articleUrl) {
  const text = normalizedTitle(`${video.title} ${articleUrl}`);
  return video.isZoneMata === true || [
    "zona da mata", "murici", "uniao dos palmares", "branquinha", "santana do mundau",
    "sao jose da laje", "ibateguara", "joaquim gomes", "flexeiras", "messias", "capela",
    "cajueiro", "atalaia", "cha preta", "colonia leopoldina"
  ].some((place) => text.includes(normalizedTitle(place)));
}

async function addRecentVideos(unique) {
  let catalog;
  try {
    catalog = JSON.parse(await readFile(discoveredVideosPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const entries = [];
  for (const [recordKey, record] of Object.entries(catalog)) {
    const articleStart = recordKey.indexOf("https://");
    if (articleStart < 0) continue;
    const articleUrl = recordKey.slice(articleStart);
    for (const video of record.videos || []) {
      const publishedTime = Date.parse(video.publishedAt);
      const embed = getVideoEmbed(video.videoEmbedUrl || video.url);
      if (!embed || !video.title || !Number.isFinite(publishedTime) || publishedTime < cutoff || publishedTime > Date.now() + 5 * 60_000) continue;
      entries.push({ articleUrl, video, embed, publishedTime });
    }
  }
  entries.sort((left, right) => right.publishedTime - left.publishedTime);
  const usedVideos = new Set();
  for (const { articleUrl, video, embed, publishedTime } of entries) {
    if (usedVideos.has(embed)) continue;
    usedVideos.add(embed);
    const titleKey = normalizedTitle(video.title);
    const article = {
      title: video.title,
      description: "",
      link: /^https:\/\//i.test(articleUrl) ? articleUrl : embed,
      image: /^https:\/\//i.test(video.imageUrl || "") ? video.imageUrl : "",
      video: embed,
      videoType: "embed",
      source: video.source || "Vídeo",
      published: new Date(publishedTime).toISOString(),
      feed: isZonaDaMataVideo(video, articleUrl) ? "mata" : video.region === "Alagoas" ? "alagoas" : "brasil",
      category: isZonaDaMataVideo(video, articleUrl) ? "Zona da Mata" : video.region === "Alagoas" ? "Alagoas" : "Brasil"
    };
    const existing = unique.get(titleKey);
    if (existing) {
      existing.video ||= article.video;
      existing.image ||= article.image;
    } else {
      unique.set(titleKey, article);
    }
  }
}

async function fetchFeed(feed) {
  const url = feed.url ? new URL(feed.url) : new URL("https://news.google.com/rss/search");
  if (!feed.url) url.search = new URLSearchParams({ q: feed.query, hl: "pt-BR", gl: "BR", ceid: "BR:pt-419" });
  const response = await fetch(url, {
    headers: { "User-Agent": "Giro360News/1.0 (personal RSS reader)", Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseFeed(await decodeFeedResponse(response), feed);
}

async function downloadCardImages(articles) {
  const selected = articles.filter((article) => /^https:\/\//i.test(article.image || "")).slice(0, 30);
  let nextIndex = 0;
  let downloaded = 0;
  const retainedFiles = new Set();
  await Promise.all(Array.from({ length: Math.min(4, selected.length) }, async () => {
    while (nextIndex < selected.length) {
      const article = selected[nextIndex++];
      const hash = createHash("sha256").update(article.image).digest("hex");
      try {
        const response = await fetch(article.image, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Giro360News/1.0)", Accept: "image/avif,image/webp,image/png,image/jpeg" },
          signal: AbortSignal.timeout(8_000)
        });
        if (!response.ok) {
          console.warn(`Imagem indisponível para card de ${article.source}: HTTP ${response.status}`);
          continue;
        }
        const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
        const declaredLength = Number(response.headers.get("content-length") || 0);
        if (!extension || declaredLength > 350_000) {
          console.warn(`Imagem ignorada para card de ${article.source}: formato não suportado ou arquivo maior que 350 KB.`);
          continue;
        }
        const image = Buffer.from(await response.arrayBuffer());
        if (!image.length || image.length > 350_000) {
          console.warn(`Imagem ignorada para card de ${article.source}: arquivo vazio ou maior que 350 KB.`);
          continue;
        }
        const filename = `${hash}.${extension}`;
        await writeFile(resolve(cardImagesPath, filename), image);
        article.cardImage = `data/card-images/${filename}`;
        retainedFiles.add(filename);
        downloaded += 1;
      } catch (error) {
        console.warn(`Não foi possível preparar a imagem para card de ${article.source}: ${error.message}`);
      }
    }
  }));
  const existingFiles = await readdir(cardImagesPath);
  await Promise.all(existingFiles
    .filter((filename) => /^[a-f0-9]{64}\.(?:jpg|png|webp)$/i.test(filename) && !retainedFiles.has(filename))
    .map((filename) => unlink(resolve(cardImagesPath, filename))));
  console.log(`Imagens prontas para cards: ${downloaded}/${selected.length}.`);
}

const results = await Promise.allSettled(feeds.map(fetchFeed));
for (const [index, result] of results.entries()) {
  if (result.status === "rejected") console.error(`${feeds[index].category}: ${result.reason.message}`);
}

const unique = new Map();
for (const result of results) {
  if (result.status !== "fulfilled") continue;
  for (const article of result.value) {
    const key = normalizedTitle(article.title);
    if (key && !unique.has(key)) unique.set(key, article);
  }
}
await addRecentVideos(unique);

if (!unique.size) {
  try {
    const previous = await readFile(outputPath, "utf8");
    if (JSON.parse(previous).articles.length) {
      console.error("Todos os feeds falharam; mantendo o snapshot anterior.");
      process.exit(0);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  throw new Error("Nenhum feed respondeu e não existe snapshot anterior para manter.");
}

const snapshot = {
  updatedAt: new Date().toISOString(),
  articles: Array.from(unique.values()).sort((left, right) => new Date(right.published) - new Date(left.published))
};
await enrichShareMetadata(snapshot.articles);
await downloadCardImages(snapshot.articles);
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
const withMedia = snapshot.articles.filter((article) => article.image || article.video).length;
console.log(`Snapshot atualizado: ${snapshot.articles.length} notícias de ${results.filter((result) => result.status === "fulfilled").length}/${feeds.length} feeds; ${withMedia} matérias com foto/vídeo.`);
