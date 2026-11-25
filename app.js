// ئەگەر API Keyـی یوتوبت هەیە لێرە دایبنێ بۆ گەڕان لە هەموو یوتوب
// ئەگەر بەتاڵ بێت، لە لیستی خوارەوە (localTracks) گەڕان دەکات
const YOUTUBE_API_KEY = "AIzaSyAXRkAhjP5J4_Zg4mG3u7k8dTrEo71MVVk";

const localTracks = [
  {
    videoId: "dQw4w9WgXcQ",
    title: "گۆرانی نموونەیی ١",
    channel: "کەناڵی مۆسیقا",
    thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  },
  {
    videoId: "jNQXAC9IVRw",
    title: "گۆرانی نموونەیی ٢",
    channel: "پەخشی گۆرانی",
    thumb: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg"
  }
];

let player = null;
let isPlayerReady = false;
let currentVideos = [...localTracks];
let activeVideoId = null;

function onYouTubeIframeAPIReady() {
  player = new YT.Player("ytPlayer", {
    height: "100%",
    width: "100%",
    videoId: localTracks[0].videoId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: () => {
        isPlayerReady = true;
        renderResults(currentVideos);
      }
    }
  });
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function setStatus(msg) {
  document.getElementById("statusMsg").textContent = msg;
}

function playVideo(videoId, title) {
  activeVideoId = videoId;
  document.getElementById("nowPlaying").textContent = `ئێستا لێدەدرێت: ${title}`;
  renderResults(currentVideos);

  if (isPlayerReady && player && typeof player.loadVideoById === "function") {
    player.loadVideoById(videoId);
  }
}

function renderResults(videos) {
  const container = document.getElementById("results");
  if (!videos || videos.length === 0) {
    container.innerHTML = `<div class="status">هیچ ئەنجامێک نەدۆزرایەوە.</div>`;
    return;
  }

  container.innerHTML = videos
    .map((v) => {
      const activeClass = v.videoId === activeVideoId ? "active" : "";
      return `
        <div class="item ${activeClass}" onclick='playVideo(${JSON.stringify(v.videoId)}, ${JSON.stringify(v.title)})'>
          <img src="${escapeHtml(v.thumb)}" alt="${escapeHtml(v.title)}" />
          <div class="item-info">
            <div class="item-title">${escapeHtml(v.title)}</div>
            <div class="item-channel">${escapeHtml(v.channel)}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

async function handleSearch(event) {
  event.preventDefault();
  const query = document.getElementById("searchInput").value.trim();
  if (!query) return;

  if (!YOUTUBE_API_KEY) {
    const q = query.toLowerCase();
    currentVideos = localTracks.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q)
    );
    setStatus(`گەڕان لە لیستی ناوخۆیی بۆ "${query}" (${currentVideos.length} ئەنجام)`);
    renderResults(currentVideos);
    return;
  }

  setStatus("گەڕان لە یوتوب...");
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=12` +
      `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok || !Array.isArray(data.items)) {
      throw new Error(data.error?.message || "هەڵە لە وەرگرتنی ئەنجام");
    }

    currentVideos = data.items
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id.videoId,
        title: item.snippet?.title || "بێ ناونیشان",
        channel: item.snippet?.channelTitle || "",
        thumb:
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          ""
      }));

    setStatus(`ئەنجامەکانی گەڕان بۆ "${query}" (${currentVideos.length})`);
    renderResults(currentVideos);

    if (currentVideos.length > 0) {
      playVideo(currentVideos[0].videoId, currentVideos[0].title);
    }
  } catch (err) {
    setStatus(`کێشەیەک ڕوویدا: ${err.message}`);
  }
}

renderResults(currentVideos);
