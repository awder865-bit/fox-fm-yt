// ١. کلیلەکەی یوتوب لێرە دابنێ
const YOUTUBE_API_KEY = "AIzaSyBFuFFBR8u8ctCWX1OGp8SfHxaTWGxw5vY";

// ٢. لیستی گۆرانییە کوردییەکان (فایلەکانی MP3 لە فۆڵدەری audio/ دابنێ یان لینکی ڕاستەوخۆی MP3 بنووسە)
const kurdishTracks = [
  {
    title: "گۆرانیی کوردی ١",
    artist: "هونەرمەندی کورد",
    url: "./audio/kurdish1.mp3"
  },
  {
    title: "گۆرانیی کوردی ٢",
    artist: "گۆرانیی فۆلکلۆر",
    url: "./audio/kurdish2.mp3"
  }
];

const ytFallbackTracks = [
  {
    videoId: "dQw4w9WgXcQ",
    title: "گۆرانی نموونەیی ١",
    channel: "کەناڵی مۆسیقا",
    thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
  }
];

// --- گۆڕینی بەشەکان (Tabs) ---
function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

// --- دۆخی ئینتەرنێت ---
function updateNetworkPill() {
  const pill = document.getElementById("netStatus");
  if (!pill) return;
  if (navigator.onLine) {
    pill.textContent = "● ئۆنلاین";
    pill.classList.remove("offline");
  } else {
    pill.textContent = "● بێ خەت (Offline)";
    pill.classList.add("offline");
  }
}

window.addEventListener("online", updateNetworkPill);
window.addEventListener("offline", updateNetworkPill);

// --- IndexedDB بۆ فۆڵدەری بێ خەت و کامێرا ڕۆڵ ---
const DB_NAME = "FoxFM_Folder_DB";
const STORE_NAME = "offline_tracks";
let db = null;
let savedTracks = [];

let activeSourceType = null;
let activeIndex = -1;
let currentObjectUrl = null;

const audioPlayer = document.getElementById("audioPlayer");
const miniPlayer = document.getElementById("miniPlayer");
const miniTitle = document.getElementById("miniTitle");
const miniArtist = document.getElementById("miniArtist");
const miniPlayBtn = document.getElementById("miniPlayBtn");
const seekBar = document.getElementById("seekBar");
const currentTimeEl = document.getElementById("currentTime");
const totalTimeEl = document.getElementById("totalTime");

let ytPlayer = null;
let isYtReady = false;
let currentVideos = [...ytFallbackTracks];
let activeVideoId = null;

// --- پاشەکەوتکراوەکانی یوتوب ---
const YT_SAVED_KEY = "fox_fm_saved_yt_v1";
let savedYtVideos = JSON.parse(localStorage.getItem(YT_SAVED_KEY) || "[]");

function saveYtStorage() {
  localStorage.setItem(YT_SAVED_KEY, JSON.stringify(savedYtVideos));
}

function saveYouTubeItem(video, event) {
  event.stopPropagation();
  const exists = savedYtVideos.some((item) => item.videoId === video.videoId);
  if (exists) {
    setStatus("ئەم گۆرانییە پێشتر لە پاشەکەوتکراوەکاندا هەیە.");
    return;
  }
  savedYtVideos.unshift(video);
  saveYtStorage();
  renderSavedYouTubeList();
  setStatus(`«${video.title}» پاشەکەوت کرا.`);
}

function removeSavedYouTubeItem(videoId, event) {
  event.stopPropagation();
  savedYtVideos = savedYtVideos.filter((item) => item.videoId !== videoId);
  saveYtStorage();
  renderSavedYouTubeList();
}

function renderSavedYouTubeList() {
  const el = document.getElementById("ytSavedList");
  const countEl = document.getElementById("ytSavedCount");
  if (!el || !countEl) return;

  countEl.textContent = `${savedYtVideos.length} گۆرانی`;

  if (savedYtVideos.length === 0) {
    el.innerHTML = `<div class="status">هێشتا هیچ گۆرانییەکی یوتوبت پاشەکەوت نەکردووە. لە ئەنجامەکانی گەڕان «💾 پاشەکەوت» دابگرە.</div>`;
    return;
  }

  el.innerHTML = savedYtVideos
    .map((v) => {
      const activeClass = v.videoId === activeVideoId ? "active" : "";
      return `
        <div class="item ${activeClass}">
          <div class="item-main" onclick='playVideo(${JSON.stringify(v.videoId)}, ${JSON.stringify(v.title)})'>
            <img src="${escapeHtml(v.thumb)}" alt="${escapeHtml(v.title)}" />
            <div>
              <div class="item-title">${escapeHtml(v.title)}</div>
              <div class="item-channel">${escapeHtml(v.channel)}</div>
            </div>
          </div>
          <button type="button" class="del-btn" onclick="removeSavedYouTubeItem(decodeURIComponent('${encodeURIComponent(v.videoId)}'), event)">سڕینەوە</button>
        </div>
      `;
    })
    .join("");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function getAllSavedTracks() {
  return new Promise((resolve) => {
    if (!db) return resolve([]);
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

function addSavedTrack(track) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).add(track);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteSavedTrackById(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
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

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function pauseYouTubeIfPlaying() {
  if (isYtReady && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
    ytPlayer.pauseVideo();
  }
}

async function importFromCameraRoll(event) {
  const files = Array.from(event.target.files || []);
  const importMsg = document.getElementById("importMsg");
  if (files.length === 0) return;

  for (const file of files) {
    const cleanName = file.name.replace(/\.[^/.]+$/, "");
    await addSavedTrack({
      title: cleanName,
      artist: "کامێرا ڕۆڵ / بێ خەت",
      blob: file
    });
  }

  event.target.value = "";
  importMsg.textContent = `${files.length} فایل خرایە ناو فۆڵدەری بێ خەت.`;
  await refreshSavedFolder();
}

async function importFromDirectUrl(event) {
  event.preventDefault();
  const input = document.getElementById("directUrlInput");
  const msgEl = document.getElementById("urlImportMsg");
  const url = input.value.trim();
  if (!url) return;

  msgEl.textContent = "خەریکی دابەزاندنە بۆ فۆڵدەری بێ خەت...";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("نەتوانرا فایلەکە دابەزێنرێت");
    const blob = await res.blob();

    const rawName = url.split("/").pop()?.split("?")[0] || "گۆرانیی دابەزێنراو";
    const cleanName = decodeURIComponent(rawName).replace(/\.[^/.]+$/, "");

    await addSavedTrack({
      title: cleanName,
      artist: "دابەزێنراو / بێ خەت",
      blob
    });

    input.value = "";
    msgEl.textContent = `«${cleanName}» بە سەرکەوتوویی خرایە ناو فۆڵدەری بێ خەت.`;
    await refreshSavedFolder();
  } catch (err) {
    msgEl.textContent = "دابەزاندنی ڕاستەوخۆ سەرکەوتوو نەبوو (لەوانەیە سێرڤەری لینکەکە ڕێگە بە CORS نەدات). دەتوانیت فایلەکە دابەزێنیت و لە کامێرا ڕۆڵ / فایلەکان هەڵیبژێریت.";
  }
}

async function deleteSavedTrack(id, event) {
  event.stopPropagation();
  const idx = savedTracks.findIndex((t) => t.id === id);
  if (activeSourceType === "saved" && idx === activeIndex) {
    audioPlayer.pause();
    audioPlayer.removeAttribute("src");
    activeSourceType = null;
    activeIndex = -1;
    miniPlayer.style.display = "none";
  }
  await deleteSavedTrackById(id);
  await refreshSavedFolder();
}

function playKurdishTrack(index) {
  const track = kurdishTracks[index];
  if (!track) return;

  pauseYouTubeIfPlaying();
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  activeSourceType = "kurdish";
  activeIndex = index;
  audioPlayer.src = track.url;
  audioPlayer.play().catch(() => {});

  miniTitle.textContent = track.title;
  miniArtist.textContent = track.artist;
  miniPlayer.style.display = "flex";
  renderAllLists();
}

function playSavedTrack(index) {
  const track = savedTracks[index];
  if (!track || !track.blob) return;

  pauseYouTubeIfPlaying();
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  currentObjectUrl = URL.createObjectURL(track.blob);

  activeSourceType = "saved";
  activeIndex = index;
  audioPlayer.src = currentObjectUrl;
  audioPlayer.play().catch(() => {});

  miniTitle.textContent = track.title;
  miniArtist.textContent = `${track.artist} • فۆڵدەری بێ خەت`;
  miniPlayer.style.display = "flex";
  renderAllLists();
}

function togglePlayPause() {
  if (!activeSourceType) return;
  if (audioPlayer.paused) {
    audioPlayer.play().catch(() => {});
  } else {
    audioPlayer.pause();
  }
}

function playPrevTrack() {
  if (activeSourceType === "kurdish" && kurdishTracks.length > 0) {
    const prev = (activeIndex - 1 + kurdishTracks.length) % kurdishTracks.length;
    playKurdishTrack(prev);
  } else if (activeSourceType === "saved" && savedTracks.length > 0) {
    const prev = (activeIndex - 1 + savedTracks.length) % savedTracks.length;
    playSavedTrack(prev);
  }
}

function playNextTrack() {
  if (activeSourceType === "kurdish" && kurdishTracks.length > 0) {
    const next = (activeIndex + 1) % kurdishTracks.length;
    playKurdishTrack(next);
  } else if (activeSourceType === "saved" && savedTracks.length > 0) {
    const next = (activeIndex + 1) % savedTracks.length;
    playSavedTrack(next);
  }
}

function seekAudio(val) {
  if (!audioPlayer.duration) return;
  audioPlayer.currentTime = (Number(val) / 100) * audioPlayer.duration;
}

audioPlayer.addEventListener("play", () => {
  miniPlayBtn.textContent = "⏸";
  renderAllLists();
});

audioPlayer.addEventListener("pause", () => {
  miniPlayBtn.textContent = "▶";
  renderAllLists();
});

audioPlayer.addEventListener("timeupdate", () => {
  if (!audioPlayer.duration) return;
  seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
  totalTimeEl.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener("ended", () => {
  playNextTrack();
});

function renderKurdishList() {
  const el = document.getElementById("kurdishList");
  document.getElementById("kurdishCount").textContent = `${kurdishTracks.length} گۆرانی`;

  el.innerHTML = kurdishTracks
    .map((track, idx) => {
      const isCurrent = activeSourceType === "kurdish" && activeIndex === idx;
      const activeClass = isCurrent ? "active" : "";
      const icon = isCurrent && !audioPlayer.paused ? "⏸" : "▶";
      return `
        <div class="track-item ${activeClass}">
          <div class="track-main" onclick="playKurdishTrack(${idx})">
            <div class="track-title">${escapeHtml(track.title)}</div>
            <div class="track-sub">${escapeHtml(track.artist)}</div>
          </div>
          <span class="track-icon">${icon}</span>
        </div>
      `;
    })
    .join("");
}

function renderSavedFolder() {
  const el = document.getElementById("offlineFolderList");
  document.getElementById("savedCount").textContent = `${savedTracks.length} فایل`;

  if (savedTracks.length === 0) {
    el.innerHTML = `<div class="status">فۆڵدەرەکە بەتاڵە. فایلێک لە کامێرا ڕۆڵ زیاد بکە.</div>`;
    return;
  }

  el.innerHTML = savedTracks
    .map((track, idx) => {
      const isCurrent = activeSourceType === "saved" && activeIndex === idx;
      const activeClass = isCurrent ? "active" : "";
      const icon = isCurrent && !audioPlayer.paused ? "⏸" : "▶";
      return `
        <div class="track-item ${activeClass}">
          <div class="track-main" onclick="playSavedTrack(${idx})">
            <div class="track-title">${escapeHtml(track.title)}</div>
            <div class="track-sub">${escapeHtml(track.artist)} • بێ خەت</div>
          </div>
          <span class="track-icon">${icon}</span>
          <button type="button" class="del-btn" onclick="deleteSavedTrack(${track.id}, event)">سڕینەوە</button>
        </div>
      `;
    })
    .join("");
}

function renderAllLists() {
  renderKurdishList();
  renderSavedFolder();
}

async function refreshSavedFolder() {
  savedTracks = await getAllSavedTracks();
  renderAllLists();
}

// --- بەشی یوتوب ---
function onYouTubeIframeAPIReady() {
  ytPlayer = new YT.Player("ytPlayer", {
    height: "100%",
    width: "100%",
    videoId: ytFallbackTracks[0].videoId,
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: () => {
        isYtReady = true;
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PLAYING && !audioPlayer.paused) {
          audioPlayer.pause();
        }
      }
    }
  });
}

function setStatus(msg) {
  document.getElementById("statusMsg").textContent = msg;
}

function playVideo(videoId, title) {
  if (!audioPlayer.paused) {
    audioPlayer.pause();
  }
  activeVideoId = videoId;
  document.getElementById("nowPlaying").textContent = `ئێستا لێدەدرێت: ${title}`;
  renderResults(currentVideos);
  renderSavedYouTubeList();

  if (isYtReady && ytPlayer && typeof ytPlayer.loadVideoById === "function") {
    ytPlayer.loadVideoById(videoId);
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
      const encodedVideo = encodeURIComponent(JSON.stringify(v));
      return `
        <div class="item ${activeClass}">
          <div class="item-main" onclick='playVideo(${JSON.stringify(v.videoId)}, ${JSON.stringify(v.title)})'>
            <img src="${escapeHtml(v.thumb)}" alt="${escapeHtml(v.title)}" />
            <div>
              <div class="item-title">${escapeHtml(v.title)}</div>
              <div class="item-channel">${escapeHtml(v.channel)}</div>
            </div>
          </div>
          <button type="button" class="save-yt-btn" onclick='saveYouTubeItem(JSON.parse(decodeURIComponent("${encodedVideo}")), event)'>💾 پاشەکەوت</button>
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
    currentVideos = ytFallbackTracks.filter(
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

(async function init() {
  updateNetworkPill();
  await openDB();
  await refreshSavedFolder();
  renderSavedYouTubeList();
  renderResults(currentVideos);
})();
