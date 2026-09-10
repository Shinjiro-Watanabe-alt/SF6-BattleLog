const characters = ["リュウ", "ルーク", "ジェイミー", "春麗", "ガイル", "キンバリー", "ジュリ", "ケン", "ブランカ", "ダルシム", "エドモンド本田", "ディージェイ", "マノン", "マリーザ", "JP", "ザンギエフ", "リリー", "キャミィ", "ラシード", "A.K.I.", "エド", "豪鬼", "ベガ", "テリー", "舞", "エレナ"];
const dealtCategories = ["起き攻め（打撃択）", "起き攻め（投げ択）", "起き攻め（シミー）", "地上戦（差し・置き・差し返し）", "生ラッシュ択", "キャンセルラッシュ択", "中足ラッシュ", "ジャンプ攻撃", "対空", "中距離戦・弾打ち", "インパクト・インパクト返し", "ジャストパリィ", "無敵・SA放し", "ドライブゲージ優位・スタン", "その他・判断保留"];
const takenCategories = ["被起き攻め（打撃択）", "被起き攻め（投げ択）", "被起き攻め（シミー）", "地上戦（差し・置き・差し返し）", "生ラッシュ択", "キャンセルラッシュ択", "中足ラッシュ", "ジャンプ攻撃（対空ミス）", "対空食らい（ジャンプ攻撃失敗）", "中距離戦・弾打ち", "被インパクト", "被ジャストパリィ", "無敵・SA放し", "ドライブゲージ不利・被スタン", "その他・判断保留"];
const damageBands = ["1,000未満", "1,000", "2,000", "3,000", "4,000", "5,000", "6,000", "7,000", "8,000", "9,000", "10,000", "10,000+"];
const eventGroups = {
  "取り逃し・反応": ["対空を落とした", "DIを返せなかった", "確反を逃した", "コンボを落とした", "ラッシュを止められなかった", "自分のジャンプが読まれた"],
  "守り・位置取り": ["端から脱出できなかった", "端から脱出できた", "起き攻めで無敵技・暴れを通された", "起き攻めで相手の暴れ・無敵技を釣れた"],
  "リソース・大局": ["自分がバーンアウトした", "相手をバーンアウトさせた", "SAを抱えたまま負けた", "SA・無敵技を無駄にした", "逆転した／逆転された"],
  "分析から分離": ["入力ミス・操作ミス", "ラグ・通信不良", "対策不明の技／連係があった"]
};

const state = { events: new Map(), damageRows: 0, takenRows: 0 };
const $ = (selector) => document.querySelector(selector);
const reviewDialog = $("#review-dialog");
const videoDialog = $("#video-dialog");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ed-match-note", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("matches")) db.createObjectStore("matches", { keyPath: "id" });
      if (!db.objectStoreNames.contains("videos")) db.createObjectStore("videos", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbPromise = openDatabase();

async function getAll(storeName) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRecord(storeName, record) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(record);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

const getMatches = async () => (await getAll("matches")).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
const getVideos = async () => (await getAll("videos")).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
const isWin = (result) => result?.startsWith("2-");
const isTimestamp = (value) => !value || /^(?:\d{1,2}:)?[0-5]\d:[0-5]\d$/.test(value);
function isYouTubeUrl(value) {
  try { return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(new URL(value).hostname); } catch { return false; }
}

function bandValue(band) {
  if (band === "1,000未満") return 500;
  return Number.parseInt((band || "").replace(/[^0-9]/g, ""), 10) || 0;
}

function fillOptions(select, options, placeholder) {
  select.replaceChildren(); select.add(new Option(placeholder, ""));
  options.forEach((value) => select.add(new Option(value, value)));
}

function addSourceRow(target, categoryOptions, kind) {
  const countKey = kind === "dealt" ? "damageRows" : "takenRows";
  if (state[countKey] >= 3) return;
  const row = $("#source-row-template").content.firstElementChild.cloneNode(true);
  const [category, band] = row.querySelectorAll("select");
  fillOptions(category, categoryOptions, "種類を選ぶ"); fillOptions(band, damageBands, "概算ダメージ");
  row.querySelector(".remove-row").addEventListener("click", () => { row.remove(); state[countKey] -= 1; updateAddButtons(); });
  target.append(row); state[countKey] += 1; updateAddButtons();
}

function updateAddButtons() {
  $("#add-damage-source").disabled = state.damageRows >= 3;
  $("#add-damage-taken").disabled = state.takenRows >= 3;
}

function renderEvents() {
  const root = $("#event-groups"); root.replaceChildren();
  Object.entries(eventGroups).forEach(([group, events]) => {
    const section = document.createElement("section"); section.className = "event-group";
    section.innerHTML = `<h4>${group}</h4><div class="event-options"></div>`;
    events.forEach((event) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "event-option"; button.dataset.event = event;
      refreshEventButton(button); button.addEventListener("click", () => cycleEvent(event, button));
      section.querySelector(".event-options").append(button);
    });
    root.append(section);
  });
  refreshEventCounter();
}

function refreshEventButton(button) {
  const frequency = state.events.get(button.dataset.event);
  button.classList.toggle("selected", Boolean(frequency));
  button.textContent = frequency === "multiple" ? `${button.dataset.event}・複数` : button.dataset.event;
}

function cycleEvent(event, button) {
  const current = state.events.get(event);
  if (!current && state.events.size >= 3) return;
  if (!current) state.events.set(event, "once"); else if (current === "once") state.events.set(event, "multiple"); else state.events.delete(event);
  refreshEventButton(button); refreshEventCounter();
}

function refreshEventCounter() { $("#event-count").textContent = `${state.events.size} / 3`; }

function updateDistanceVisual() {
  const value = Number($("#distance").value);
  $("#distance-output").value = value.toFixed(1);
  $("#ed-figure").style.left = `${9 + ((4 - value) / 4) * 61}%`;
}

function renderVideoOptions(videos) {
  const select = $("#video-id"); const selected = select.value;
  fillOptions(select, videos.map((video) => video.id), "動画ログを選ぶ（任意）");
  videos.forEach((video, index) => { select.options[index + 1].textContent = `${video.date} · ${video.title}`; });
  select.value = selected;
}

async function resetForm() {
  $("#review-form").reset(); state.events.clear(); state.damageRows = 0; state.takenRows = 0;
  $("#damage-sources").replaceChildren(); $("#damage-taken").replaceChildren();
  addSourceRow($("#damage-sources"), dealtCategories, "dealt"); addSourceRow($("#damage-taken"), takenCategories, "taken");
  renderEvents(); updateDistanceVisual(); renderVideoOptions(await getVideos());
}

function collectSources(container) {
  return [...container.querySelectorAll(".source-row")].map((row) => {
    const [category, band] = row.querySelectorAll("select"); return { category: category.value, damageBand: band.value };
  }).filter((item) => item.category && item.damageBand);
}

function createMatchFromForm() {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), character: "エド", videoId: $("#video-id").value || null,
    videoStart: $("#video-start").value.trim(), videoEnd: $("#video-end").value.trim(), opponent: $("#opponent").value, result: $("#result").value,
    distance: Number($("#distance").value), damageSources: collectSources($("#damage-sources")), damageTakenSources: collectSources($("#damage-taken")),
    notableEvents: [...state.events.entries()].map(([event, frequency]) => ({ event, frequency })), reviewLater: $("#review-later").checked, note: $("#note").value.trim() };
}

function createVideoFromForm() {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), date: $("#video-date").value,
    title: $("#video-name").value.trim(), url: $("#video-url").value.trim(), note: $("#video-note").value.trim() };
}

function topCategory(matches, key) {
  const totals = new Map();
  matches.forEach((match) => (match[key] || []).forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + bandValue(item.damageBand))));
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
}

function eventOccurrences(matches, label) { return matches.filter((match) => (match.notableEvents || []).some((item) => item.event === label)).length; }

function renderInsights(matches) {
  const root = $("#insights"); root.replaceChildren();
  if (matches.length < 3) { root.innerHTML = '<p class="empty-message">あと少なくとも2セット記録すると、ダメージ傾向を確認できる。</p>'; return; }
  const losses = matches.filter((match) => !isWin(match.result)); const insights = []; const taken = topCategory(losses, "damageTakenSources");
  if (taken) insights.push({ title: `被ダメージの中心：${taken[0]}`, detail: `敗北セットで概算 ${taken[1].toLocaleString()} 以上。対応策を優先して確認する。` });
  const dealt = topCategory(matches.filter((match) => isWin(match.result)), "damageSources");
  if (dealt) insights.push({ title: `再現したい勝ち筋：${dealt[0]}`, detail: "勝利セットで最も多く記録された得点源。距離と状況を意識して再現する。" });
  const antiAirMisses = eventOccurrences(matches, "対空を落とした");
  if (antiAirMisses >= 2) insights.push({ title: "対空の確認", detail: `直近${matches.length}セット中${antiAirMisses}セットで対空ミスを記録。ジャンプ・地上行動を混ぜた反応練習を行う。` });
  const average = matches.reduce((sum, match) => sum + Number(match.distance), 0) / matches.length;
  if (average < 1.2) insights.push({ title: "近距離に寄りすぎていないか確認", detail: `平均距離 ${average.toFixed(1)}。エドの中距離戦が薄くなっていないか、被ダメージ源と合わせて見る。` });
  if (average > 3.1) insights.push({ title: "遠距離に留まりすぎていないか確認", detail: `平均距離 ${average.toFixed(1)}。フリッカー先端や中Kが機能する距離へ入れているか見直す。` });
  if (!insights.length) insights.push({ title: "記録を継続", detail: "さらに試合を記録すると、相手キャラ別の傾向を出せる。" });
  insights.slice(0, 3).forEach((insight) => { const item = document.createElement("article"); item.className = "insight"; item.innerHTML = `<strong>${insight.title}</strong><p>${insight.detail}</p>`; root.append(item); });
}

function formatVideoTime(match) { return match.videoStart ? ` · 動画内 ${match.videoStart}${match.videoEnd ? `〜${match.videoEnd}` : "〜"}` : ""; }

function renderMatches(matches, videos) {
  const root = $("#recent-matches"); root.replaceChildren();
  if (!matches.length) { root.innerHTML = '<p class="empty-message">まだ記録はない。最初のセットを記録して始める。</p>'; return; }
  const videoNames = new Map(videos.map((video) => [video.id, video.title]));
  matches.slice(0, 10).forEach((match) => {
    const item = document.createElement("article"); item.className = "match-item";
    const dealt = match.damageSources?.[0]?.category || "ダメージ源未記録"; const taken = match.damageTakenSources?.[0]?.category || "被ダメージ源未記録";
    const video = match.videoId ? ` · ${videoNames.get(match.videoId) || "動画ログ"}${formatVideoTime(match)}` : "";
    item.innerHTML = `<strong>${isWin(match.result) ? "勝利" : "敗北"} ${match.result} vs ${match.opponent}</strong><p>距離 ${Number(match.distance).toFixed(1)} · 与：${dealt} · 被：${taken}</p><span class="match-meta">${new Date(match.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${match.reviewLater ? " · 要リプレイ確認" : ""}${video}</span>`;
    root.append(item);
  });
}

function renderVideos(videos, matches) {
  const root = $("#video-logs"); root.replaceChildren();
  if (!videos.length) { root.innerHTML = '<p class="empty-message">まず1日分の限定公開動画を登録する。分析後のJSON取込でも動画ログは追加される。</p>'; return; }
  videos.slice(0, 8).forEach((video) => {
    const item = document.createElement("article"); item.className = "video-item";
    const linkedSets = matches.filter((match) => match.videoId === video.id).length;
    item.innerHTML = `<strong>${video.date} · ${video.title}</strong><p>${linkedSets} セットを紐付け済み${video.note ? ` · ${video.note}` : ""}</p>`;
    const link = document.createElement("a"); link.href = video.url; link.target = "_blank"; link.rel = "noopener"; link.textContent = "動画を開く"; item.append(link); root.append(item);
  });
}

async function refreshDashboard() {
  const [matches, videos] = await Promise.all([getMatches(), getVideos()]); const recent = matches.slice(0, 10); const wins = recent.filter((match) => isWin(match.result)).length;
  $("#recent-win-rate").textContent = recent.length ? `${Math.round((wins / recent.length) * 100)}%` : "—";
  $("#average-distance").textContent = recent.length ? (recent.reduce((sum, match) => sum + Number(match.distance), 0) / recent.length).toFixed(1) : "—";
  $("#review-later-count").textContent = matches.filter((match) => match.reviewLater).length;
  renderInsights(recent); renderVideos(videos, matches); renderMatches(matches, videos);
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

async function exportData() {
  const [matches, videos] = await Promise.all([getMatches(), getVideos()]);
  downloadJson(`ed-match-note-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 2, exportedAt: new Date().toISOString(), videos, matches });
}

function downloadTemplate() {
  const videoId = "video-2026-09-10-01";
  downloadJson("ed-video-analysis-template.json", { schemaVersion: 2, videos: [{ id: videoId, date: "2026-09-10", title: "ランクマ 2026-09-10 夜", url: "https://www.youtube.com/watch?v=REPLACE_ME", note: "10セット分" }], matches: [{ id: "match-2026-09-10-01", createdAt: "2026-09-10T12:00:00.000Z", character: "エド", videoId, videoStart: "12:34", videoEnd: "16:52", opponent: "ケン", result: "2-1", distance: 2.1, damageSources: [{ category: "中足ラッシュ", damageBand: "4,000" }], damageTakenSources: [{ category: "被起き攻め（投げ択）", damageBand: "3,000" }], notableEvents: [{ event: "対空を落とした", frequency: "once" }], reviewLater: false, note: "端での守りを再確認" }] });
}

function normaliseVideo(video) {
  if (!video || !video.title || !video.url || !video.date) throw new Error("動画ログに日付・タイトル・URLが必要");
  if (!isYouTubeUrl(video.url)) throw new Error("YouTubeのURLを入力して");
  return { id: video.id || crypto.randomUUID(), createdAt: video.createdAt || new Date().toISOString(), date: video.date, title: video.title, url: video.url, note: video.note || "" };
}

function normaliseMatch(match) {
  if (!match || !match.opponent || !match.result) throw new Error("セット記録に相手キャラと結果が必要");
  if (!isTimestamp(match.videoStart || "") || !isTimestamp(match.videoEnd || "")) throw new Error("動画内時間は 12:34 または 1:12:34 で入力");
  return { id: match.id || crypto.randomUUID(), createdAt: match.createdAt || new Date().toISOString(), character: match.character || "エド", videoId: match.videoId || null, videoStart: match.videoStart || "", videoEnd: match.videoEnd || "", opponent: match.opponent, result: match.result, distance: Number.isFinite(Number(match.distance)) ? Number(match.distance) : 2, damageSources: Array.isArray(match.damageSources) ? match.damageSources : [], damageTakenSources: Array.isArray(match.damageTakenSources) ? match.damageTakenSources : [], notableEvents: Array.isArray(match.notableEvents) ? match.notableEvents : [], reviewLater: Boolean(match.reviewLater), note: match.note || "" };
}

async function importData(file) {
  const payload = JSON.parse(await file.text()); const videos = Array.isArray(payload.videos) ? payload.videos.map(normaliseVideo) : []; const matches = Array.isArray(payload.matches) ? payload.matches.map(normaliseMatch) : [];
  if (!videos.length && !matches.length) throw new Error("取り込める動画ログまたはセット記録が見つからない");
  if (!window.confirm(`${videos.length}本の動画ログと${matches.length}セットを現在の記録へ追加・更新する。続ける？`)) return;
  for (const video of videos) await saveRecord("videos", video); for (const match of matches) await saveRecord("matches", match);
  await refreshDashboard(); alert(`${videos.length}本の動画ログと${matches.length}セットを取り込んだ。`);
}

async function requestPersistentStorage() { if (navigator.storage?.persist) await navigator.storage.persist(); }

function initialise() {
  fillOptions($("#opponent"), characters, "相手キャラを選ぶ"); $("#distance").addEventListener("input", updateDistanceVisual);
  const openReview = async () => { await resetForm(); reviewDialog.showModal(); };
  const openVideo = () => { $("#video-form").reset(); $("#video-date").value = new Date().toISOString().slice(0, 10); videoDialog.showModal(); };
  $("#new-review").addEventListener("click", openReview); $("#new-video").addEventListener("click", openVideo); $("#new-video-inline").addEventListener("click", openVideo);
  $("#close-dialog").addEventListener("click", () => reviewDialog.close()); $("#cancel-review").addEventListener("click", () => reviewDialog.close()); $("#close-video-dialog").addEventListener("click", () => videoDialog.close()); $("#cancel-video").addEventListener("click", () => videoDialog.close());
  $("#add-damage-source").addEventListener("click", () => addSourceRow($("#damage-sources"), dealtCategories, "dealt")); $("#add-damage-taken").addEventListener("click", () => addSourceRow($("#damage-taken"), takenCategories, "taken"));
  $("#review-form").addEventListener("submit", async (event) => { event.preventDefault(); const match = createMatchFromForm(); if (!isTimestamp(match.videoStart) || !isTimestamp(match.videoEnd)) { alert("動画内時間は 12:34 または 1:12:34 の形式で入力して。"); return; } await saveRecord("matches", match); reviewDialog.close(); await refreshDashboard(); });
  $("#video-form").addEventListener("submit", async (event) => { event.preventDefault(); const video = createVideoFromForm(); if (!isYouTubeUrl(video.url)) { alert("YouTubeのURLを正しく入力して。"); return; } await saveRecord("videos", video); videoDialog.close(); await refreshDashboard(); });
  $("#export-data").addEventListener("click", exportData); $("#download-template").addEventListener("click", downloadTemplate);
  $("#import-data").addEventListener("change", async (event) => { const [file] = event.target.files; if (!file) return; try { await importData(file); } catch (error) { alert(`取込に失敗：${error.message}`); } event.target.value = ""; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js"); requestPersistentStorage().catch(() => {}); refreshDashboard();
}

initialise();
