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
const milestonePhases = ["中距離", "攻め継続", "起き攻め", "端の守り", "対空", "ゲージ・SA", "その他"];
const milestoneEvaluations = ["勝敗の分岐点", "再現したい勝ち筋", "繰り返す失点", "要検証"];
const milestoneActionTypes = ["再現する", "やめる", "トレモで練習する"];
const milestoneReviewStatuses = ["未確認", "確認済み", "練習済み"];

const state = { events: new Map(), damageRows: 0, takenRows: 0, activeMatchId: null, activeVideoId: null, editingMilestoneId: null };
const $ = (selector) => document.querySelector(selector);
const reviewDialog = $("#review-dialog");
const videoDialog = $("#video-dialog");
const matchDialog = $("#match-dialog");
const milestoneDialog = $("#milestone-dialog");

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function timestampToSeconds(timestamp) {
  return timestamp.split(":").map(Number).reduce((seconds, part) => seconds * 60 + part, 0);
}

function milestoneVideoUrl(videoUrl, timestamp) {
  const url = new URL(videoUrl);
  url.searchParams.set("t", String(timestampToSeconds(timestamp)));
  return url.toString();
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
    notableEvents: [...state.events.entries()].map(([event, frequency]) => ({ event, frequency })), milestones: [], reviewLater: $("#review-later").checked, note: $("#note").value.trim() };
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
    const milestoneCount = (match.milestones || []).length;
    item.innerHTML = `<strong>${isWin(match.result) ? "勝利" : "敗北"} ${match.result} vs ${escapeHtml(match.opponent)}</strong><p>距離 ${Number(match.distance).toFixed(1)} · 与：${escapeHtml(dealt)} · 被：${escapeHtml(taken)}</p><span class="match-meta">${new Date(match.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${match.reviewLater ? " · 要リプレイ確認" : ""}${video}</span>`;
    const action = document.createElement("button"); action.type = "button"; action.className = "text-button milestone-open-button";
    action.dataset.matchId = match.id; action.textContent = `重要局面 ${milestoneCount} / 5`;
    item.append(action);
    root.append(item);
  });
}

async function openMatchDetails(matchId) {
  const [matches, videos] = await Promise.all([getMatches(), getVideos()]);
  const match = matches.find((item) => item.id === matchId);
  if (!match) { alert("セット記録が見つからない。画面を更新してからもう一度試して。"); return; }
  state.activeMatchId = matchId;
  const video = videos.find((item) => item.id === match.videoId);
  $("#match-detail-title").textContent = `${isWin(match.result) ? "勝利" : "敗北"} ${match.result} vs ${match.opponent}`;
  $("#match-detail-meta").textContent = video ? `${video.date} · ${video.title}` : "動画未紐付け：動画ログを登録してセットへ紐付けると、該当時刻から開ける。";
  renderMilestones(match, video);
  if (!matchDialog.open) matchDialog.showModal();
}

function renderMilestones(match, video) {
  const root = $("#milestone-list"); root.replaceChildren();
  const milestones = match.milestones || [];
  $("#add-milestone").disabled = milestones.length >= 5;
  if (!milestones.length) {
    root.innerHTML = '<p class="empty-message">勝敗を分けた局面を1つ残すと、次に確認する行動が明確になる。</p>';
    return;
  }
  milestones.sort((a, b) => timestampToSeconds(a.timestamp) - timestampToSeconds(b.timestamp)).forEach((milestone) => {
    const item = document.createElement("article"); item.className = "milestone-item";
    item.innerHTML = `<div class="milestone-heading"><div><span class="milestone-badge">${escapeHtml(milestone.evaluation)}</span><span class="milestone-phase">${escapeHtml(milestone.phase)}</span></div><span class="milestone-status">${escapeHtml(milestone.reviewStatus)}</span></div><p>${escapeHtml(milestone.summary)}</p><strong>次回：${escapeHtml(milestone.actionType)} — ${escapeHtml(milestone.nextAction)}</strong>`;
    const actions = document.createElement("div"); actions.className = "milestone-actions";
    const jump = document.createElement("button"); jump.type = "button"; jump.className = "text-button"; jump.textContent = `▶ ${milestone.timestamp}`;
    jump.disabled = !video;
    jump.title = video ? "YouTubeで該当時刻を開く" : "動画ログを紐付けると開ける";
    jump.addEventListener("click", () => window.open(milestoneVideoUrl(video.url, milestone.timestamp), "_blank", "noopener"));
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "text-button"; edit.textContent = "編集";
    edit.addEventListener("click", () => openMilestoneForm(milestone));
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-button danger-button"; remove.textContent = "削除";
    remove.addEventListener("click", () => deleteMilestone(milestone.id));
    actions.append(jump, edit, remove); item.append(actions); root.append(item);
  });
}

function openMilestoneForm(milestone = null) {
  state.editingMilestoneId = milestone?.id || null;
  $("#milestone-title").textContent = milestone ? "重要局面を編集" : "重要局面を追加";
  $("#milestone-form").reset();
  [
    ["#milestone-phase", milestonePhases, "局面を選ぶ"],
    ["#milestone-evaluation", milestoneEvaluations, "評価を選ぶ"],
    ["#milestone-action-type", milestoneActionTypes, "方針を選ぶ"],
    ["#milestone-review-status", milestoneReviewStatuses, "状況を選ぶ"]
  ].forEach(([selector, options, placeholder]) => fillOptions($(selector), options, placeholder));
  if (milestone) {
    $("#milestone-timestamp").value = milestone.timestamp; $("#milestone-phase").value = milestone.phase;
    $("#milestone-evaluation").value = milestone.evaluation; $("#milestone-action-type").value = milestone.actionType;
    $("#milestone-review-status").value = milestone.reviewStatus; $("#milestone-summary").value = milestone.summary; $("#milestone-next-action").value = milestone.nextAction;
  }
  milestoneDialog.showModal();
}

function createMilestoneFromForm() {
  return { id: state.editingMilestoneId || crypto.randomUUID(), timestamp: $("#milestone-timestamp").value.trim(), phase: $("#milestone-phase").value,
    evaluation: $("#milestone-evaluation").value, summary: $("#milestone-summary").value.trim(), nextAction: $("#milestone-next-action").value.trim(),
    actionType: $("#milestone-action-type").value, reviewStatus: $("#milestone-review-status").value };
}

function normaliseMilestone(milestone) {
  if (!milestone || !isTimestamp(milestone.timestamp || "") || !milestone.timestamp) throw new Error("重要局面の時間は 12:34 または 1:12:34 で入力");
  if (!milestonePhases.includes(milestone.phase) || !milestoneEvaluations.includes(milestone.evaluation) || !milestoneActionTypes.includes(milestone.actionType) || !milestoneReviewStatuses.includes(milestone.reviewStatus)) throw new Error("重要局面の選択項目が不正");
  if (!milestone.summary || !milestone.nextAction || milestone.summary.length > 120 || milestone.nextAction.length > 120) throw new Error("重要局面の内容と次回の行動は1〜120文字で入力");
  return { id: milestone.id || crypto.randomUUID(), timestamp: milestone.timestamp, phase: milestone.phase, evaluation: milestone.evaluation, summary: milestone.summary, nextAction: milestone.nextAction, actionType: milestone.actionType, reviewStatus: milestone.reviewStatus };
}

async function saveMilestone() {
  const milestone = normaliseMilestone(createMilestoneFromForm());
  const matches = await getMatches(); const match = matches.find((item) => item.id === state.activeMatchId);
  if (!match) throw new Error("セット記録が見つからない");
  const milestones = (match.milestones || []).filter((item) => item.id !== milestone.id);
  if (milestones.length >= 5) throw new Error("重要局面は1セットにつき5件まで");
  match.milestones = [...milestones, milestone]; await saveRecord("matches", match); milestoneDialog.close(); await refreshDashboard(); await openMatchDetails(match.id);
}

async function deleteMilestone(milestoneId) {
  if (!window.confirm("この重要局面を削除する？")) return;
  const matches = await getMatches(); const match = matches.find((item) => item.id === state.activeMatchId);
  if (!match) return;
  match.milestones = (match.milestones || []).filter((item) => item.id !== milestoneId); await saveRecord("matches", match); await refreshDashboard(); await openMatchDetails(match.id);
}

function renderVideos(videos, matches) {
  const root = $("#video-logs"); root.replaceChildren();
  if (!videos.length) { root.innerHTML = '<p class="empty-message">まず1日分の限定公開動画を登録する。分析後のJSON取込でも動画ログは追加される。</p>'; return; }
  videos.slice(0, 8).forEach((video) => {
    const item = document.createElement("article"); item.className = "video-item";
    const linkedMatches = matches.filter((match) => match.videoId === video.id);
    const summary = dailySummary(linkedMatches);
    item.innerHTML = `<strong>${escapeHtml(video.date)} · ${escapeHtml(video.title)}</strong><div class="video-card-summary"><span>${summary.setCount}セット · ${summary.record}</span><span>平均距離 ${summary.distance}</span><span>練習 ${summary.trainingCount}件</span></div><p>勝ち筋：${escapeHtml(summary.dealt)}<br>失点：${escapeHtml(summary.taken)}</p>`;
    const action = document.createElement("button"); action.type = "button"; action.className = "text-button video-detail-button"; action.dataset.videoId = video.id; action.textContent = "分析を見る・依頼する →";
    item.append(action); root.append(item);
  });
}

function dailySummary(matches) {
  const wins = matches.filter((match) => isWin(match.result)).length;
  const dealt = topCategory(matches, "damageSources")?.[0] || "まだ未記録";
  const taken = topCategory(matches, "damageTakenSources")?.[0] || "まだ未記録";
  const distance = matches.length ? (matches.reduce((sum, match) => sum + Number(match.distance), 0) / matches.length).toFixed(1) : "—";
  const trainingCount = matches.flatMap((match) => match.milestones || []).filter((milestone) => milestone.actionType === "トレモで練習する" && milestone.reviewStatus !== "練習済み").length;
  return { setCount: matches.length, wins, losses: matches.length - wins, record: matches.length ? `${wins}勝${matches.length - wins}敗 · ${Math.round((wins / matches.length) * 100)}%` : "セット未登録", dealt, taken, distance, trainingCount };
}

function renderDailySummary(video, matches) {
  const summary = dailySummary(matches); const root = $("#video-summary");
  root.innerHTML = `<div class="daily-summary-grid"><article><span>セット</span><strong>${summary.setCount}</strong></article><article><span>勝敗</span><strong>${summary.record}</strong></article><article><span>平均距離</span><strong>${summary.distance}</strong></article><article><span>要練習</span><strong>${summary.trainingCount}</strong></article></div><div class="daily-focus"><p><strong>主な勝ち筋：</strong>${escapeHtml(summary.dealt)}</p><p><strong>主な失点：</strong>${escapeHtml(summary.taken)}</p>${video.note ? `<p><strong>メモ：</strong>${escapeHtml(video.note)}</p>` : ""}</div>`;
}

async function openVideoDetails(videoId) {
  const [videos, matches] = await Promise.all([getVideos(), getMatches()]); const video = videos.find((item) => item.id === videoId);
  if (!video) { alert("動画ログが見つからない。画面を更新してからもう一度試して。"); return; }
  state.activeVideoId = videoId; const linkedMatches = matches.filter((match) => match.videoId === videoId);
  $("#video-detail-title").textContent = `${video.date} · ${video.title}`; $("#video-detail-meta").textContent = "限定公開URLを共有して、動画分析結果をJSONで取り込める。";
  renderDailySummary(video, linkedMatches); renderVideoMatches(linkedMatches);
  if (!$("#video-detail-dialog").open) $("#video-detail-dialog").showModal();
}

function renderVideoMatches(matches) {
  const root = $("#video-match-list"); root.replaceChildren();
  if (!matches.length) { root.innerHTML = '<p class="empty-message">まだセットはない。動画を見ながら最初のセットを追加する。</p>'; return; }
  matches.forEach((match) => {
    const item = document.createElement("article"); item.className = "match-item";
    item.innerHTML = `<strong>${isWin(match.result) ? "勝利" : "敗北"} ${match.result} vs ${escapeHtml(match.opponent)}</strong><p>距離 ${Number(match.distance).toFixed(1)}${formatVideoTime(match)} · 重要局面 ${(match.milestones || []).length}件</p>`;
    const action = document.createElement("button"); action.type = "button"; action.className = "text-button milestone-open-button video-match-detail-button"; action.dataset.matchId = match.id; action.textContent = "セットを振り返る →";
    item.append(action); root.append(item);
  });
}

function buildAnalysisRequest(video, matches) {
  const summary = dailySummary(matches);
  return `SF6 エドの対戦動画を分析して。\n\n動画：${video.url}\n日付：${video.date}\nタイトル：${video.title}\n対象セット：${summary.setCount}セット\n\n各セットについて、相手キャラ、結果、平均距離、主なダメージ源・被ダメージ源、重要局面（時刻・局面・評価・起きたこと・次回の行動）を抽出して。\nSF6-BattleLogに取り込めるJSON形式（schemaVersion: 3）で返して。既存セットがある場合は同じidを維持して更新して。`;
}

async function copyAnalysisRequest() {
  const [videos, matches] = await Promise.all([getVideos(), getMatches()]); const video = videos.find((item) => item.id === state.activeVideoId);
  if (!video) throw new Error("動画ログが見つからない");
  const request = buildAnalysisRequest(video, matches.filter((match) => match.videoId === video.id));
  if (!navigator.clipboard?.writeText) throw new Error("このブラウザではクリップボードを使えない");
  await navigator.clipboard.writeText(request); return request;
}

async function shareAnalysisRequest() {
  const [videos, matches] = await Promise.all([getVideos(), getMatches()]); const video = videos.find((item) => item.id === state.activeVideoId);
  if (!video) throw new Error("動画ログが見つからない");
  const request = buildAnalysisRequest(video, matches.filter((match) => match.videoId === video.id));
  if (navigator.share) { await navigator.share({ title: "SF6-BattleLog 分析依頼", text: request }); return; }
  if (!navigator.clipboard?.writeText) throw new Error("共有とクリップボードに対応していないブラウザ");
  await navigator.clipboard.writeText(request); alert("共有機能がないため、依頼文をコピーした。ChatGPTへ貼り付けて。");
}

async function downloadAnalysisTemplate() {
  const [videos, matches] = await Promise.all([getVideos(), getMatches()]); const video = videos.find((item) => item.id === state.activeVideoId);
  if (!video) throw new Error("動画ログが見つからない");
  const linkedMatches = matches.filter((match) => match.videoId === video.id).map((match) => ({ ...match, milestones: match.milestones || [] }));
  downloadJson(`ed-analysis-${video.date}.json`, { schemaVersion: 3, videos: [video], matches: linkedMatches });
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
  downloadJson(`ed-match-note-${new Date().toISOString().slice(0, 10)}.json`, { schemaVersion: 3, exportedAt: new Date().toISOString(), videos, matches });
}

function downloadTemplate() {
  const videoId = "video-2026-09-10-01";
  downloadJson("ed-video-analysis-template.json", { schemaVersion: 3, videos: [{ id: videoId, date: "2026-09-10", title: "ランクマ 2026-09-10 夜", url: "https://www.youtube.com/watch?v=REPLACE_ME", note: "10セット分" }], matches: [{ id: "match-2026-09-10-01", createdAt: "2026-09-10T12:00:00.000Z", character: "エド", videoId, videoStart: "12:34", videoEnd: "16:52", opponent: "ケン", result: "2-1", distance: 2.1, damageSources: [{ category: "中足ラッシュ", damageBand: "4,000" }], damageTakenSources: [{ category: "被起き攻め（投げ択）", damageBand: "3,000" }], notableEvents: [{ event: "対空を落とした", frequency: "once" }], milestones: [{ id: "milestone-2026-09-10-01", timestamp: "14:18", phase: "端の守り", evaluation: "繰り返す失点", summary: "投げ抜けを意識しすぎてシミーから大ダメージを受けた", nextAction: "最初の起き攻めはガードして、投げ抜けは遅らせる", actionType: "トレモで練習する", reviewStatus: "未確認" }], reviewLater: false, note: "端での守りを再確認" }] });
}

function normaliseVideo(video) {
  if (!video || !video.title || !video.url || !video.date) throw new Error("動画ログに日付・タイトル・URLが必要");
  if (!isYouTubeUrl(video.url)) throw new Error("YouTubeのURLを入力して");
  return { id: video.id || crypto.randomUUID(), createdAt: video.createdAt || new Date().toISOString(), date: video.date, title: video.title, url: video.url, note: video.note || "" };
}

function normaliseMatch(match) {
  if (!match || !match.opponent || !match.result) throw new Error("セット記録に相手キャラと結果が必要");
  if (!isTimestamp(match.videoStart || "") || !isTimestamp(match.videoEnd || "")) throw new Error("動画内時間は 12:34 または 1:12:34 で入力");
  const milestones = Array.isArray(match.milestones) ? match.milestones.map(normaliseMilestone) : [];
  if (milestones.length > 5) throw new Error("重要局面は1セットにつき5件まで");
  return { id: match.id || crypto.randomUUID(), createdAt: match.createdAt || new Date().toISOString(), character: match.character || "エド", videoId: match.videoId || null, videoStart: match.videoStart || "", videoEnd: match.videoEnd || "", opponent: match.opponent, result: match.result, distance: Number.isFinite(Number(match.distance)) ? Number(match.distance) : 2, damageSources: Array.isArray(match.damageSources) ? match.damageSources : [], damageTakenSources: Array.isArray(match.damageTakenSources) ? match.damageTakenSources : [], notableEvents: Array.isArray(match.notableEvents) ? match.notableEvents : [], milestones, reviewLater: Boolean(match.reviewLater), note: match.note || "" };
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
  const openReviewForVideo = async () => { await resetForm(); $("#video-id").value = state.activeVideoId || ""; $("#video-start").focus(); reviewDialog.showModal(); };
  const openVideo = () => { $("#video-form").reset(); $("#video-date").value = new Date().toISOString().slice(0, 10); videoDialog.showModal(); };
  $("#new-video").addEventListener("click", openVideo); $("#new-video-inline").addEventListener("click", openVideo); $("#new-review-for-video").addEventListener("click", openReviewForVideo);
  $("#close-dialog").addEventListener("click", () => reviewDialog.close()); $("#cancel-review").addEventListener("click", () => reviewDialog.close()); $("#close-video-dialog").addEventListener("click", () => videoDialog.close()); $("#cancel-video").addEventListener("click", () => videoDialog.close());
  $("#close-video-detail-dialog").addEventListener("click", () => $("#video-detail-dialog").close());
  $("#close-match-dialog").addEventListener("click", () => matchDialog.close()); $("#close-milestone-dialog").addEventListener("click", () => milestoneDialog.close()); $("#cancel-milestone").addEventListener("click", () => milestoneDialog.close());
  $("#add-damage-source").addEventListener("click", () => addSourceRow($("#damage-sources"), dealtCategories, "dealt")); $("#add-damage-taken").addEventListener("click", () => addSourceRow($("#damage-taken"), takenCategories, "taken"));
  $("#review-form").addEventListener("submit", async (event) => { event.preventDefault(); const match = createMatchFromForm(); if (!isTimestamp(match.videoStart) || !isTimestamp(match.videoEnd)) { alert("動画内時間は 12:34 または 1:12:34 の形式で入力して。"); return; } await saveRecord("matches", match); reviewDialog.close(); await refreshDashboard(); if (state.activeVideoId && match.videoId === state.activeVideoId) await openVideoDetails(state.activeVideoId); });
  $("#video-form").addEventListener("submit", async (event) => { event.preventDefault(); const video = createVideoFromForm(); if (!isYouTubeUrl(video.url)) { alert("YouTubeのURLを正しく入力して。"); return; } await saveRecord("videos", video); videoDialog.close(); await refreshDashboard(); });
  $("#recent-matches").addEventListener("click", (event) => { const button = event.target.closest(".milestone-open-button"); if (button) openMatchDetails(button.dataset.matchId); });
  $("#video-logs").addEventListener("click", (event) => { const button = event.target.closest(".video-detail-button"); if (button) openVideoDetails(button.dataset.videoId); });
  $("#video-match-list").addEventListener("click", (event) => { const button = event.target.closest(".video-match-detail-button"); if (button) openMatchDetails(button.dataset.matchId); });
  $("#open-detail-video").addEventListener("click", async () => { const video = (await getVideos()).find((item) => item.id === state.activeVideoId); if (video) window.open(video.url, "_blank", "noopener"); });
  $("#share-analysis-request").addEventListener("click", async () => { try { await shareAnalysisRequest(); } catch (error) { if (error.name !== "AbortError") alert(`共有に失敗：${error.message}`); } });
  $("#copy-analysis-request").addEventListener("click", async () => { try { await copyAnalysisRequest(); alert("分析依頼文をコピーした。ChatGPTへ貼り付けて。"); } catch (error) { alert(`コピーに失敗：${error.message}`); } });
  $("#download-analysis-template").addEventListener("click", async () => { try { await downloadAnalysisTemplate(); } catch (error) { alert(`雛形の作成に失敗：${error.message}`); } });
  $("#add-milestone").addEventListener("click", () => openMilestoneForm());
  $("#milestone-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveMilestone(); } catch (error) { alert(`保存に失敗：${error.message}`); } });
  $("#export-data").addEventListener("click", exportData); $("#download-template").addEventListener("click", downloadTemplate);
  $("#import-data").addEventListener("change", async (event) => { const [file] = event.target.files; if (!file) return; try { await importData(file); } catch (error) { alert(`取込に失敗：${error.message}`); } event.target.value = ""; });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js"); requestPersistentStorage().catch(() => {}); refreshDashboard();
}

initialise();
