const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const youtubeOptionsEl = document.getElementById("youtubeOptions");
const sourceTrackEl = document.getElementById("sourceTrack");
const targetLanguageEl = document.getElementById("targetLanguage");
const titleEl = document.getElementById("title");
const languageEl = document.getElementById("language");
const countEl = document.getElementById("count");
const debugEl = document.getElementById("debug");
const previewEl = document.getElementById("preview");
const extractButton = document.getElementById("extract");
const loadTrackButton = document.getElementById("loadTrack");
const downloadTxtButton = document.getElementById("downloadTxt");
const downloadSrtButton = document.getElementById("downloadSrt");
const downloadJsonButton = document.getElementById("downloadJson");

let currentResult = null;
let youtubeContext = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function sanitizeFilename(value) {
  return String(value || "video_subtitle")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "video_subtitle";
}

function formatTimestamp(seconds, separator = ",") {
  const total = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function bodyToTxt(body) {
  const lines = [];
  let previous = "";
  for (const item of body) {
    const content = String(item.content || "").trim();
    if (content && content !== previous) {
      lines.push(content);
      previous = content;
    }
  }
  return `${lines.join("\n")}\n`;
}

function bodyToSrt(body) {
  return `${body.map((item, index) => {
    const start = formatTimestamp(item.from);
    const end = formatTimestamp(item.to);
    return `${index + 1}\n${start} --> ${end}\n${String(item.content || "").trim()}`;
  }).join("\n\n")}\n`;
}

function downloadText(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { accept: "application/json, text/plain, */*" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("没有找到当前浏览器标签页。");
  return tab;
}

function detectSite(url) {
  const parsed = new URL(url);
  if (parsed.hostname === "www.bilibili.com" && parsed.pathname.startsWith("/video/")) {
    return "bilibili";
  }
  if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname)) {
    if (parsed.pathname === "/watch" || parsed.pathname.startsWith("/shorts/")) return "youtube";
  }
  throw new Error("请先打开一个 B站或 YouTube 视频页面。");
}

function getBvidFromUrl(url) {
  return String(url || "").match(/BV[0-9A-Za-z]+/)?.[0] || "";
}

async function getBilibiliVideoInfo(bvid) {
  const view = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
  if (view.code !== 0) throw new Error(view.message || "获取 B站视频信息失败。");

  const aid = String(view.data?.aid || "");
  const cid = String(view.data?.pages?.[0]?.cid || view.data?.cid || "");
  const title = view.data?.title || bvid;
  if (!aid || !cid) throw new Error("没有获取到当前视频的 aid/cid。");
  return { bvid, aid, cid, title };
}

async function collectLoadedBilibiliSubtitleUrls(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => [...new Set(
      performance.getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => url.includes("aisubtitle.hdslb.com/bfs/ai_subtitle/"))
    )].reverse()
  });
  return injection?.result || [];
}

function pickMatchingBilibiliUrls(urls, video) {
  const fullKey = `${video.aid}${video.cid}`;
  const strictMatches = urls.filter((url) => url.includes(fullKey));
  return strictMatches.length ? strictMatches : urls.filter((url) => url.includes(video.cid));
}

async function loadBilibiliSubtitleFromUrls(urls) {
  const errors = [];
  for (const url of urls) {
    try {
      const subtitleJson = await fetchJson(url);
      if (subtitleJson?.body?.length) return { subtitleJson, subtitleUrl: url };
      errors.push("JSON 中没有 body");
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  throw new Error(`匹配到字幕地址，但读取失败：${errors[0] || "未知错误"}`);
}

async function extractBilibili(tab) {
  const bvid = getBvidFromUrl(tab.url);
  if (!bvid) throw new Error("当前地址中没有找到 BV 号。");

  const video = await getBilibiliVideoInfo(bvid);
  const loadedUrls = await collectLoadedBilibiliSubtitleUrls(tab.id);
  const matchingUrls = pickMatchingBilibiliUrls(loadedUrls, video);
  if (!matchingUrls.length) {
    throw new Error("没有发现当前视频已加载的字幕。请打开字幕并播放几秒，然后重试。");
  }

  const { subtitleJson, subtitleUrl } = await loadBilibiliSubtitleFromUrls(matchingUrls);
  return {
    site: "bilibili",
    id: bvid,
    title: video.title,
    language: "B站字幕",
    source: "loaded-aisubtitle-url",
    subtitleUrl,
    body: subtitleJson.body,
    originalJson: subtitleJson
  };
}

function readYouTubePlayerDataInPage() {
  const player = document.getElementById("movie_player");
  let response = null;

  try {
    response = player?.getPlayerResponse?.() || null;
  } catch (_) {
    response = null;
  }

  if (!response) response = globalThis.ytInitialPlayerResponse || null;
  if (!response) {
    try {
      response = JSON.parse(globalThis.ytplayer?.config?.args?.player_response || "null");
    } catch (_) {
      response = null;
    }
  }

  const renderer = response?.captions?.playerCaptionsTracklistRenderer;
  const textOf = (value) => value?.simpleText || value?.runs?.map((run) => run.text).join("") || "";
  const tracks = (renderer?.captionTracks || []).map((track, index) => ({
    id: `${index}:${track.languageCode}:${track.kind || "manual"}`,
    baseUrl: track.baseUrl,
    languageCode: track.languageCode,
    name: textOf(track.name) || track.languageCode,
    kind: track.kind || "manual",
    isTranslatable: Boolean(track.isTranslatable)
  }));
  const translationLanguages = (renderer?.translationLanguages || []).map((language) => ({
    code: language.languageCode,
    name: textOf(language.languageName) || language.languageCode
  }));

  return {
    videoId: response?.videoDetails?.videoId || new URL(location.href).searchParams.get("v") || location.pathname.split("/").filter(Boolean).pop() || "youtube",
    title: response?.videoDetails?.title || document.title.replace(/\s*-\s*YouTube\s*$/, ""),
    tracks,
    translationLanguages
  };
}

async function getYouTubeContext(tab) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: readYouTubePlayerDataInPage
  });
  const context = injection?.result;
  if (!context?.tracks?.length) {
    throw new Error("没有发现 YouTube 字幕轨道。请刷新页面，确认播放器中能打开 CC，然后重试。");
  }
  return context;
}

function populateYouTubeOptions(context) {
  sourceTrackEl.replaceChildren();
  for (const track of context.tracks) {
    const option = document.createElement("option");
    option.value = track.id;
    option.textContent = `${track.name} · ${track.kind === "asr" ? "自动生成" : "人工/作者"}`;
    sourceTrackEl.append(option);
  }

  const manualIndex = context.tracks.findIndex((track) => track.kind !== "asr");
  sourceTrackEl.selectedIndex = manualIndex >= 0 ? manualIndex : 0;

  targetLanguageEl.replaceChildren();
  const original = document.createElement("option");
  original.value = "";
  original.textContent = "不翻译（原字幕）";
  targetLanguageEl.append(original);

  const preferredOrder = ["zh-Hans", "zh-Hant", "en", "ja", "ko"];
  const languages = [...context.translationLanguages].sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a.code);
    const bIndex = preferredOrder.indexOf(b.code);
    if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    return a.name.localeCompare(b.name);
  });
  for (const language of languages) {
    const option = document.createElement("option");
    option.value = language.code;
    option.textContent = `${language.name} (${language.code})`;
    targetLanguageEl.append(option);
  }

  youtubeOptionsEl.hidden = false;
  extractButton.hidden = true;
  refreshTranslationAvailability();
}

function refreshTranslationAvailability() {
  const track = youtubeContext?.tracks.find((item) => item.id === sourceTrackEl.value);
  targetLanguageEl.disabled = !track?.isTranslatable;
  if (!track?.isTranslatable) targetLanguageEl.value = "";
}

function youtubeJson3ToBody(json) {
  const body = [];
  let previous = "";
  for (const event of json?.events || []) {
    if (!event?.segs?.length || !Number.isFinite(event.tStartMs)) continue;
    const content = event.segs.map((segment) => segment.utf8 || "").join("").replace(/\u200b/g, "").trim();
    if (!content || content === previous) continue;
    const start = event.tStartMs / 1000;
    const duration = Number.isFinite(event.dDurationMs) ? event.dDurationMs / 1000 : 2;
    body.push({ from: start, to: start + Math.max(duration, 0.1), content });
    previous = content;
  }
  return body;
}

async function extractSelectedYouTubeTrack() {
  if (!youtubeContext) throw new Error("请先读取 YouTube 字幕轨道。");
  const track = youtubeContext.tracks.find((item) => item.id === sourceTrackEl.value);
  if (!track) throw new Error("没有找到所选字幕轨道。");

  const targetCode = targetLanguageEl.value;
  if (targetCode && !track.isTranslatable) throw new Error("这个字幕轨道不支持 YouTube 自动翻译。");

  const subtitleUrl = new URL(track.baseUrl);
  subtitleUrl.searchParams.set("fmt", "json3");
  if (targetCode) subtitleUrl.searchParams.set("tlang", targetCode);
  else subtitleUrl.searchParams.delete("tlang");

  const subtitleJson = await fetchJson(subtitleUrl.href);
  const body = youtubeJson3ToBody(subtitleJson);
  if (!body.length) throw new Error("YouTube 返回了空字幕。请刷新视频页面后重新读取。");

  const target = youtubeContext.translationLanguages.find((item) => item.code === targetCode);
  const language = targetCode
    ? `${target?.name || targetCode}（由 ${track.name} 自动翻译）`
    : `${track.name}（${track.kind === "asr" ? "自动生成" : "人工/作者"}）`;

  return {
    site: "youtube",
    id: youtubeContext.videoId,
    title: youtubeContext.title,
    language,
    source: track.kind === "asr" ? "youtube-auto-caption" : "youtube-caption",
    sourceLanguage: track.languageCode,
    targetLanguage: targetCode || null,
    subtitleUrl: subtitleUrl.href,
    body,
    originalJson: subtitleJson
  };
}

function showResult(result) {
  currentResult = result;
  const preview = result.body.slice(0, 6).map((item) => item.content).filter(Boolean).join(" / ");
  titleEl.textContent = result.title;
  languageEl.textContent = result.language;
  countEl.textContent = `${result.body.length} 个字幕片段`;
  debugEl.textContent = `${result.site} · ${result.id} · ${result.source}`;
  previewEl.textContent = preview;
  resultEl.hidden = false;
  setStatus("抽取成功。请检查预览，然后选择格式下载。");
}

function setBusy(button, busy) {
  button.disabled = busy;
  sourceTrackEl.disabled = busy;
  if (busy) targetLanguageEl.disabled = true;
  else refreshTranslationAvailability();
}

extractButton.addEventListener("click", async () => {
  setBusy(extractButton, true);
  resultEl.hidden = true;
  youtubeOptionsEl.hidden = true;
  currentResult = null;
  youtubeContext = null;
  setStatus("正在读取当前视频页面……");

  try {
    const tab = await getActiveTab();
    const site = detectSite(tab.url);
    if (site === "bilibili") {
      setStatus("正在查找 B站已加载字幕……");
      showResult(await extractBilibili(tab));
    } else {
      setStatus("正在读取 YouTube 字幕轨道……");
      youtubeContext = await getYouTubeContext(tab);
      populateYouTubeOptions(youtubeContext);
      setStatus(`发现 ${youtubeContext.tracks.length} 条原始字幕轨道，请选择后抽取。`);
    }
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    setBusy(extractButton, false);
  }
});

loadTrackButton.addEventListener("click", async () => {
  setBusy(loadTrackButton, true);
  resultEl.hidden = true;
  currentResult = null;
  setStatus("正在下载并转换所选 YouTube 字幕……");
  try {
    showResult(await extractSelectedYouTubeTrack());
  } catch (error) {
    setStatus(error.message || String(error));
  } finally {
    setBusy(loadTrackButton, false);
  }
});

sourceTrackEl.addEventListener("change", () => {
  refreshTranslationAvailability();
  resultEl.hidden = true;
  currentResult = null;
});

targetLanguageEl.addEventListener("change", () => {
  resultEl.hidden = true;
  currentResult = null;
});

downloadTxtButton.addEventListener("click", () => {
  if (!currentResult) return;
  const stem = sanitizeFilename(`${currentResult.id} ${currentResult.title} ${currentResult.language}`);
  downloadText(`${stem}.txt`, bodyToTxt(currentResult.body), "text/plain");
});

downloadSrtButton.addEventListener("click", () => {
  if (!currentResult) return;
  const stem = sanitizeFilename(`${currentResult.id} ${currentResult.title} ${currentResult.language}`);
  downloadText(`${stem}.srt`, bodyToSrt(currentResult.body), "application/x-subrip");
});

downloadJsonButton.addEventListener("click", () => {
  if (!currentResult) return;
  const stem = sanitizeFilename(`${currentResult.id} ${currentResult.title} ${currentResult.language}`);
  const payload = {
    site: currentResult.site,
    videoId: currentResult.id,
    title: currentResult.title,
    language: currentResult.language,
    source: currentResult.source,
    sourceLanguage: currentResult.sourceLanguage || null,
    targetLanguage: currentResult.targetLanguage || null,
    body: currentResult.body,
    original: currentResult.originalJson
  };
  downloadText(`${stem}.json`, JSON.stringify(payload, null, 2), "application/json");
});
