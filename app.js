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
const dialog = $("#review-dialog");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ed-match-note", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("matches", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const dbPromise = openDatabase();

async function getMatches() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction("matches", "readonly").objectStore("matches").getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

async function saveMatch(match) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = db.transaction("matches", "readwrite").objectStore("matches").put(match);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function bandValue(band) {
  if (!band) return 0;
  if (band === "1,000未満") return 500;
  return Number.parseInt(band.replace(/[^0-9]/g, ""), 10) || 0;
}

function fillOptions(select, options, placeholder) {
  select.replaceChildren();
  select.add(new Option(placeholder, ""));
  options.forEach((value) => select.add(new Option(value, value)));
}

function addSourceRow(target, categoryOptions, kind) {
  const countKey = kind === "dealt" ? "damageRows" : "takenRows";
  if (state[countKey] >= 3) return;
  const template = $("#source-row-template");
  const row = template.content.firstElementChild.cloneNode(true);
  const [category, band] = row.querySelectorAll("select");
  fillOptions(category, categoryOptions, "種類を選ぶ");
  fillOptions(band, damageBands, "概算ダメージ");
  row.querySelector(".remove-row").addEventListener("click", () => {
    row.remove();
    state[countKey] -= 1;
    updateAddButtons();
  });
  target.append(row);
  state[countKey] += 1;
  updateAddButtons();
}

function updateAddButtons() {
  $("#add-damage-source").disabled = state.damageRows >= 3;
  $("#add-damage-taken").disabled = state.takenRows >= 3;
}

function renderEvents() {
  const root = $("#event-groups");
  root.replaceChildren();
  Object.entries(eventGroups).forEach(([group, events]) => {
    const section = document.createElement("section");
    section.className = "event-group";
    section.innerHTML = `<h4>${group}</h4><div class="event-options"></div>`;
    const options = section.querySelector(".event-options");
    events.forEach((event) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "event-option";
      button.dataset.event = event;
      refreshEventButton(button);
      button.addEventListener("click", () => cycleEvent(event, button));
      options.append(button);
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
  if (!current) state.events.set(event, "once");
  else if (current === "once") state.events.set(event, "multiple");
  else state.events.delete(event);
  refreshEventButton(button);
  refreshEventCounter();
}

function refreshEventCounter() {
  $("#event-count").textContent = `${state.events.size} / 3`;
}

function updateDistanceVisual() {
  const value = Number($("#distance").value);
  $("#distance-output").value = value.toFixed(1);
  const left = 9 + ((4 - value) / 4) * 61;
  $("#ed-figure").style.left = `${left}%`;
}

function resetForm() {
  $("#review-form").reset();
  state.events.clear();
  state.damageRows = 0;
  state.takenRows = 0;
  $("#damage-sources").replaceChildren();
  $("#damage-taken").replaceChildren();
  addSourceRow($("#damage-sources"), dealtCategories, "dealt");
  addSourceRow($("#damage-taken"), takenCategories, "taken");
  renderEvents();
  updateDistanceVisual();
}

function collectSources(container) {
  return [...container.querySelectorAll(".source-row")].map((row) => {
    const [category, band] = row.querySelectorAll("select");
    return { category: category.value, damageBand: band.value };
  }).filter((item) => item.category && item.damageBand);
}

function isWin(result) { return result.startsWith("2-"); }

function createMatchFromForm() {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    character: "エド",
    opponent: $("#opponent").value,
    result: $("#result").value,
    distance: Number($("#distance").value),
    damageSources: collectSources($("#damage-sources")),
    damageTakenSources: collectSources($("#damage-taken")),
    notableEvents: [...state.events.entries()].map(([event, frequency]) => ({ event, frequency })),
    reviewLater: $("#review-later").checked,
    note: $("#note").value.trim()
  };
}

function topCategory(matches, key) {
  const totals = new Map();
  matches.forEach((match) => match[key].forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + bandValue(item.damageBand))));
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
}

function eventOccurrences(matches, label) {
  return matches.filter((match) => match.notableEvents.some((item) => item.event === label)).length;
}

function renderInsights(matches) {
  const root = $("#insights");
  root.replaceChildren();
  if (matches.length < 3) {
    root.innerHTML = '<p class="empty-message">あと少なくとも2セット記録すると、ダメージ傾向を確認できる。</p>';
    return;
  }
  const losses = matches.filter((match) => !isWin(match.result));
  const insights = [];
  const taken = topCategory(losses, "damageTakenSources");
  if (taken) insights.push({ title: `被ダメージの中心：${taken[0]}`, detail: `敗北セットで概算 ${taken[1].toLocaleString()} 以上。対応策を優先して確認する。` });
  const dealt = topCategory(matches.filter((match) => isWin(match.result)), "damageSources");
  if (dealt) insights.push({ title: `再現したい勝ち筋：${dealt[0]}`, detail: `勝利セットで最も多く記録された得点源。距離と状況を意識して再現する。` });
  const antiAirMisses = eventOccurrences(matches, "対空を落とした");
  if (antiAirMisses >= 2) insights.push({ title: "対空の確認", detail: `直近${matches.length}セット中${antiAirMisses}セットで対空ミスを記録。ジャンプ・地上行動を混ぜた反応練習を行う。` });
  const average = matches.reduce((sum, match) => sum + match.distance, 0) / matches.length;
  if (average < 1.2) insights.push({ title: "近距離に寄りすぎていないか確認", detail: `平均距離 ${average.toFixed(1)}。エドの中距離戦が薄くなっていないか、被ダメージ源と合わせて見る。` });
  if (average > 3.1) insights.push({ title: "遠距離に留まりすぎていないか確認", detail: `平均距離 ${average.toFixed(1)}。フリッカー先端や中Kが機能する距離へ入れているか見直す。` });
  if (!insights.length) insights.push({ title: "記録を継続", detail: "さらに試合を記録すると、相手キャラ別の傾向を出せる。" });
  insights.slice(0, 3).forEach((insight) => {
    const item = document.createElement("article"); item.className = "insight"; item.innerHTML = `<strong>${insight.title}</strong><p>${insight.detail}</p>`; root.append(item);
  });
}

function renderMatches(matches) {
  const root = $("#recent-matches"); root.replaceChildren();
  if (!matches.length) { root.innerHTML = '<p class="empty-message">まだ記録はない。最初のセットを記録して始める。</p>'; return; }
  matches.slice(0, 10).forEach((match) => {
    const item = document.createElement("article"); item.className = "match-item";
    const dealt = match.damageSources[0]?.category || "ダメージ源未記録";
    const taken = match.damageTakenSources[0]?.category || "被ダメージ源未記録";
    item.innerHTML = `<strong>${isWin(match.result) ? "勝利" : "敗北"} ${match.result} vs ${match.opponent}</strong><p>距離 ${match.distance.toFixed(1)} · 与：${dealt} · 被：${taken}</p><span class="match-meta">${new Date(match.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}${match.reviewLater ? " · 要リプレイ確認" : ""}</span>`;
    root.append(item);
  });
}

async function refreshDashboard() {
  const matches = await getMatches();
  const recent = matches.slice(0, 10);
  const wins = recent.filter((match) => isWin(match.result)).length;
  $("#recent-win-rate").textContent = recent.length ? `${Math.round((wins / recent.length) * 100)}%` : "—";
  $("#average-distance").textContent = recent.length ? (recent.reduce((sum, match) => sum + match.distance, 0) / recent.length).toFixed(1) : "—";
  $("#review-later-count").textContent = matches.filter((match) => match.reviewLater).length;
  renderInsights(recent);
  renderMatches(matches);
}

function exportData() {
  getMatches().then((matches) => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), matches }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `ed-match-note-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  });
}

function initialise() {
  fillOptions($("#opponent"), characters, "相手キャラを選ぶ");
  $("#distance").addEventListener("input", updateDistanceVisual);
  $("#new-review").addEventListener("click", () => { resetForm(); dialog.showModal(); });
  $("#close-dialog").addEventListener("click", () => dialog.close());
  $("#cancel-review").addEventListener("click", () => dialog.close());
  $("#add-damage-source").addEventListener("click", () => addSourceRow($("#damage-sources"), dealtCategories, "dealt"));
  $("#add-damage-taken").addEventListener("click", () => addSourceRow($("#damage-taken"), takenCategories, "taken"));
  $("#review-form").addEventListener("submit", async (event) => { event.preventDefault(); const match = createMatchFromForm(); await saveMatch(match); dialog.close(); refreshDashboard(); });
  $("#export-data").addEventListener("click", exportData);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
  refreshDashboard();
}

initialise();
