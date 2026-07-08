const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const titleEl = document.getElementById("title");
const countEl = document.getElementById("count");
const debugEl = document.getElementById("debug");
const previewEl = document.getElementById("preview");
const extractButton = document.getElementById("extract");
const downloadTxtButton = document.getElementById("downloadTxt");
const downloadSrtButton = document.getElementById("downloadSrt");
const downloadJsonButton = document.getElementById("downloadJson");

let currentResult = null;

function setStatus(message) {
  statusEl.textContent = message;
}

function sanitizeFilename(value) {
  return String(value || "bilibili_subtitle")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "bilibili_subtitle";
}

function formatTimestamp(seconds, separator = ",") {
  const total = Math.round(Number(seconds) * 1000);
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
  if (!tab?.id) throw new Error("No active tab found.");
  if (!/^https:\/\/www\.bilibili\.com\/video\//.test(tab.url || "")) {
    throw new Error("Please open a Bilibili video page first.");
  }
  return tab;
}

function getBvidFromUrl(url) {
  return String(url || "").match(/BV[0-9A-Za-z]+/)?.[0] || "";
}

async function getVideoInfo(bvid) {
  const view = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
  if (view.code !== 0) throw new Error(view.message || "Failed to get video info.");

  const aid = String(view.data?.aid || "");
  const cid = String(view.data?.pages?.[0]?.cid || view.data?.cid || "");
  const title = view.data?.title || bvid;
  if (!aid || !cid) throw new Error("Failed to get current aid/cid.");
  return { bvid, aid, cid, title };
}

async function collectLoadedSubtitleUrls(tabId) {
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return [...new Set(
        performance.getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.includes("aisubtitle.hdslb.com/bfs/ai_subtitle/"))
      )].reverse();
    }
  });
  return injection?.result || [];
}

function pickMatchingUrls(urls, video) {
  const fullKey = `${video.aid}${video.cid}`;
  const strictMatches = urls.filter((url) => url.includes(fullKey));
  if (strictMatches.length) return strictMatches;

  // Older subtitle paths normally include aid+cid, but keep cid-only as a cautious fallback.
  return urls.filter((url) => url.includes(video.cid));
}

async function loadSubtitleFromUrls(urls) {
  const errors = [];
  for (const url of urls) {
    try {
      const subtitleJson = await fetchJson(url);
      if (subtitleJson?.body?.length) {
        return { subtitleJson, subtitleUrl: url };
      }
      errors.push("JSON has no body");
    } catch (error) {
      errors.push(error.message || String(error));
    }
  }
  throw new Error(`Matched subtitle URL failed: ${errors[0] || "unknown error"}`);
}

async function extractFromCurrentTab() {
  const tab = await getActiveTab();
  const bvid = getBvidFromUrl(tab.url);
  if (!bvid) throw new Error("No BV id found in current tab URL.");

  const video = await getVideoInfo(bvid);
  const loadedUrls = await collectLoadedSubtitleUrls(tab.id);
  const matchingUrls = pickMatchingUrls(loadedUrls, video);

  if (!matchingUrls.length) {
    throw new Error(
      `No loaded subtitle URL matches this video. Expected aid=${video.aid}, cid=${video.cid}. Turn subtitles on, play for a few seconds, then click extract again.`
    );
  }

  const { subtitleJson, subtitleUrl } = await loadSubtitleFromUrls(matchingUrls);
  const preview = subtitleJson.body
    .slice(0, 6)
    .map((item) => String(item.content || "").trim())
    .filter(Boolean)
    .join(" / ");

  return {
    ...video,
    source: "loaded-aisubtitle-url",
    language: "subtitle",
    subtitleUrl,
    preview,
    subtitleJson
  };
}

extractButton.addEventListener("click", async () => {
  extractButton.disabled = true;
  resultEl.hidden = true;
  setStatus("Searching loaded subtitle URL for the current video...");

  try {
    currentResult = await extractFromCurrentTab();
    titleEl.textContent = currentResult.title;
    countEl.textContent = `${currentResult.subtitleJson.body.length} segments`;
    debugEl.textContent = `BV=${currentResult.bvid} aid=${currentResult.aid} cid=${currentResult.cid} source=${currentResult.source}`;
    previewEl.textContent = currentResult.preview || "";
    resultEl.hidden = false;
    setStatus("Extraction succeeded. Check preview, then download.");
  } catch (error) {
    currentResult = null;
    setStatus(error.message || String(error));
  } finally {
    extractButton.disabled = false;
  }
});

downloadTxtButton.addEventListener("click", () => {
  const stem = sanitizeFilename(`${currentResult.bvid} ${currentResult.title}`);
  downloadText(`${stem}.txt`, bodyToTxt(currentResult.subtitleJson.body), "text/plain");
});

downloadSrtButton.addEventListener("click", () => {
  const stem = sanitizeFilename(`${currentResult.bvid} ${currentResult.title}`);
  downloadText(`${stem}.srt`, bodyToSrt(currentResult.subtitleJson.body), "application/x-subrip");
});

downloadJsonButton.addEventListener("click", () => {
  const stem = sanitizeFilename(`${currentResult.bvid} ${currentResult.title}`);
  downloadText(`${stem}.json`, JSON.stringify(currentResult.subtitleJson, null, 2), "application/json");
});
