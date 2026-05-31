/* ── 음력 변환 (Intl API 활용) ────────────────────────── */
const _lunarFmt = (() => {
  try { return new Intl.DateTimeFormat("ko-u-ca-chinese", { month: "numeric", day: "numeric" }); }
  catch { return null; }
})();

function getLunarDate(date) {
  if (!_lunarFmt) return null;
  try {
    const parts = _lunarFmt.formatToParts(date);
    const m = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
    const d = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
    return (m && d) ? { month: m, day: d } : null;
  } catch { return null; }
}

function lunarStr(date) {
  const l = getLunarDate(date);
  if (!l) return "";
  return l.day === 1 ? `음 ${l.month}월` : String(l.day);
}

/* ── 공휴일 ───────────────────────────────────────────── */
const FIXED_HOLS = new Map([
  ["01-01","신정"], ["03-01","삼일절"], ["05-05","어린이날"],
  ["06-06","현충일"], ["08-15","광복절"],
  ["10-03","개천절"], ["10-09","한글날"], ["12-25","크리스마스"],
]);
const LUNAR_HOLS = [
  { lm:1, ld:1,  name:"설날" },
  { lm:1, ld:2,  name:"설날연휴" },
  { lm:4, ld:8,  name:"부처님오신날" },
  { lm:8, ld:14, name:"추석연휴" },
  { lm:8, ld:15, name:"추석" },
  { lm:8, ld:16, name:"추석연휴" },
];
const _holCache = {};

function getHolidays(year) {
  if (_holCache[year]) return _holCache[year];
  const h = {};
  FIXED_HOLS.forEach((name, md) => { h[`${year}-${md}`] = name; });

  // 음력 공휴일 — 전년도 12월부터 스캔 (설날 전날 포함)
  for (let offset = -31; offset < 366; offset++) {
    const date = new Date(year, 0, 1 + offset);
    const y = date.getFullYear();
    if (y < year - 1 || y > year) continue;
    const l = getLunarDate(date);
    if (!l) continue;
    const key = dateKey(date);
    if (y === year) {
      for (const { lm, ld, name } of LUNAR_HOLS) {
        if (l.month === lm && l.day === ld && !h[key]) h[key] = name;
      }
    } else if (y === year - 1) {
      // 설날 전날 (전년 12월 말)
      if ((l.month === 12 && (l.day === 29 || l.day === 30)) && !h[key]) {
        // check if 설날 is Jan 1 of current year — handled below
      }
    }
  }

  // 설날 전날
  const seollal = Object.keys(h).find((k) => h[k] === "설날");
  if (seollal) {
    const prev = new Date(seollal);
    prev.setDate(prev.getDate() - 1);
    const pk = dateKey(prev);
    if (!h[pk]) h[pk] = "설날연휴";
  }

  // 대체공휴일 (일요일 → 다음 평일)
  const keys = Object.keys(h).filter((k) => k.startsWith(String(year))).sort();
  keys.forEach((key) => {
    const d = new Date(key);
    const isSun = d.getDay() === 0;
    const isSatChildren = h[key] === "어린이날" && d.getDay() === 6;
    if (!isSun && !isSatChildren) return;
    const next = new Date(d);
    next.setDate(next.getDate() + (isSatChildren ? 2 : 1));
    let nk = dateKey(next);
    while (h[nk]) { next.setDate(next.getDate() + 1); nk = dateKey(next); }
    if (nk.startsWith(String(year))) h[nk] = "대체공휴일";
  });

  _holCache[year] = h;
  return h;
}

/* ── Event type config ────────────────────────────────── */
const EVENT_TYPES = {
  birthday:         { label: "생일",          icon: "🎂", calIcon: "🎂", group: "생일",  calClass: "birthday" },
  vacation:         { label: "종일 휴가",      icon: "🏖", calIcon: "🏖", group: "휴가",  calClass: "vacation" },
  vacation_half_am: { label: "오전 반차",      icon: "🌤", calIcon: "🌤", group: "휴가",  calClass: "vacation vacation-half" },
  vacation_half_pm: { label: "오후 반차",      icon: "🌦", calIcon: "🌦", group: "휴가",  calClass: "vacation vacation-half" },
  vacation_q_am1:   { label: "오전(1) 반반차", icon: "◔",  calIcon: "◔",  group: "휴가",  calClass: "vacation vacation-quarter" },
  vacation_q_am2:   { label: "오전(2) 반반차", icon: "◑",  calIcon: "◑",  group: "휴가",  calClass: "vacation vacation-quarter" },
  vacation_q_pm1:   { label: "오후(1) 반반차", icon: "◕",  calIcon: "◕",  group: "휴가",  calClass: "vacation vacation-quarter" },
  vacation_q_pm2:   { label: "오후(2) 반반차", icon: "◉",  calIcon: "◉",  group: "휴가",  calClass: "vacation vacation-quarter" },
  business_trip:    { label: "출장",           icon: "✈️", calIcon: "✈️", group: "출장",  calClass: "business_trip" },
  education:        { label: "교육",           icon: "📚", calIcon: "📚", group: "교육",  calClass: "education" },
  // 하위 호환 (기존 저장 데이터용)
  wedding:          { label: "결혼",           icon: "💍", calIcon: "💍", group: "경조",  calClass: "wedding" },
  birth_baby:       { label: "출산",           icon: "👶", calIcon: "👶", group: "경조",  calClass: "birth_baby" },
  funeral:          { label: "부고",           icon: "🙏", calIcon: "🙏", group: "경조",  calClass: "funeral" },
  congratulation:   { label: "경조사",         icon: "🎉", calIcon: "🎉", group: "경조",  calClass: "congratulation" },
};
function typeLabel(type) { return EVENT_TYPES[type]?.label || type; }
function typeIcon(type)  { return EVENT_TYPES[type]?.icon  || "•";  }

/* ── 클라이언트 ID 생성 (subtask 등 클라이언트 임시 ID용) ──── */
function genLocalId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── 토스트 팝업 ──────────────────────────────────────────── */
let _toastTimer = null;
function showToast(message, type = "success") {
  let box = document.getElementById("toastBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "toastBox";
    document.body.appendChild(box);
  }
  box.innerHTML = message;
  box.className = `toast-box toast-${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { box.classList.remove("show"); }, 3800);
}

/* ── Real-time sync ───────────────────────────────────── */
const POLL_MS = 30_000; // 30초 자동 갱신
let _pollTimer = null;

function startPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (document.hidden || !S.member) return;
    if (S.currentTab === "team") renderTeam(true);
    else if (S.currentTab === "calendar") renderCalendar(true);
  }, POLL_MS);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function setSyncBar(msg, type = "ok") {
  const bar = document.getElementById("teamSyncBar");
  if (!bar) return;
  bar.textContent = msg;
  bar.className = `sync-bar ${type}`;
}

// 화면 복귀 시 즉시 갱신 (다른 앱/탭 갔다 돌아올 때)
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && S.member) {
    if (S.currentTab === "team") renderTeam(true);
    else if (S.currentTab === "calendar") renderCalendar(true);
    else if (S.currentTab === "dashboard") renderDashboard();
  }
});

/* ── State ─────────────────────────────────────────────── */
const S = {
  token: localStorage.getItem("smc_token") || null,
  member: null,
  members: [],
  currentTab: "dashboard",
  dash: { year: 0, week: 0 },
  team: { year: 0, week: 0, part: "전체" },
  cal: { year: 0, month: 0 },
  comp: { year: 0, week: 0 },
  weekTasks: [],          // 이번 주 업무 통합 리스트 (구 lastResults+nextPlans)
  recurring: [],
  tasks: [],
  taskFilter: "active",   // 레거시 (미사용)
};

/* ── ISO week helpers ─────────────────────────────────── */
function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}
function getISOYear(d) {
  const date = new Date(d);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  return date.getFullYear();
}
function weekStart(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const ms = jan4.getTime() - dayOfWeek * 86400000 + (week - 1) * 7 * 86400000;
  return new Date(ms);
}
function weekEnd(year, week) {
  const s = weekStart(year, week);
  return new Date(s.getTime() + 6 * 86400000);
}
function fmtDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function fmtFull(d) {
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
// toISOString()은 UTC 기준이라 UTC+9에서 날짜가 하루 밀림 → 로컬 날짜 키 사용
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(d) {
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}
function weekLabel(year, week) {
  const s = weekStart(year, week);
  const e = weekEnd(year, week);
  return `${year}년 ${week}주차 (${fmtDate(s)} ~ ${fmtDate(e)})`;
}
function todayYW() {
  const now = new Date();
  return { year: getISOYear(now), week: getISOWeek(now), month: now.getMonth() + 1 };
}
function prevWeek(y, w) {
  if (w === 1) {
    const maxW = getISOWeek(new Date(y - 1, 11, 28));
    return { year: y - 1, week: maxW };
  }
  return { year: y, week: w - 1 };
}
function nextWeek(y, w) {
  const maxW = getISOWeek(new Date(y, 11, 28));
  if (w >= maxW) return { year: y + 1, week: 1 };
  return { year: y, week: w + 1 };
}

/* ── API ──────────────────────────────────────────────── */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (S.token) opts.headers["Authorization"] = `Bearer ${S.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "오류가 발생했습니다.");
  return data;
}

/* ── Login ────────────────────────────────────────────── */
async function loadMemberList() {
  try {
    const members = await api("GET", "/api/members");
    S.members = members;

    // 로그인 이름 선택
    const sel = $("loginName");
    sel.innerHTML = '<option value="">-- 이름을 선택하세요 --</option>';
    members.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.name;
      o.textContent = `${m.name} (${m.part})`;
      sel.appendChild(o);
    });

    // PIN 변경 이름 선택 (독립)
    const cpSel = $("cpName");
    if (cpSel) {
      cpSel.innerHTML = '<option value="">-- 이름을 선택하세요 --</option>';
      members.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.name;
        o.textContent = `${m.name} (${m.part})`;
        cpSel.appendChild(o);
      });
    }
  } catch {}
}

async function doLogin() {
  const name = $("loginName").value.trim();
  const pin = $("loginPin").value.trim();
  $("loginError").textContent = "";
  if (!name) { $("loginError").textContent = "이름을 선택하세요."; return; }
  if (!pin) { $("loginError").textContent = "PIN을 입력하세요."; return; }
  try {
    const data = await api("POST", "/api/login", { name, pin });
    S.token = data.token;
    S.member = data.member;
    localStorage.setItem("smc_token", data.token);
    enterApp();
  } catch (e) {
    $("loginError").textContent = e.message;
  }
}

async function doChangePin() {
  const name = ($("cpName")?.value || "").trim();
  const oldPin = $("cpOldPin").value.trim();
  const newPin = $("cpNewPin").value.trim();
  const newPin2 = $("cpNewPin2").value.trim();
  const msg = $("changePinMsg");
  msg.style.color = "var(--warn)";
  msg.textContent = "";
  if (!name) { msg.textContent = "❗ 이름을 먼저 선택하세요."; return; }
  if (!oldPin) { msg.textContent = "❗ 현재 PIN을 입력하세요."; return; }
  if (!newPin) { msg.textContent = "❗ 새 PIN을 입력하세요."; return; }
  if (!/^\d{4,8}$/.test(newPin)) { msg.textContent = "❗ 새 PIN은 4~8자리 숫자여야 합니다."; return; }
  if (newPin !== newPin2) { msg.textContent = "❗ 새 PIN이 일치하지 않습니다. 다시 입력해 주세요."; return; }
  if (newPin === oldPin) { msg.textContent = "❗ 새 PIN이 현재 PIN과 동일합니다."; return; }

  // 변경하기 버튼 비활성화 (중복 요청 방지)
  const btn = $("changePinBtn");
  btn.disabled = true;
  btn.textContent = "처리 중...";

  try {
    await api("POST", "/api/change-pin", { name, old_pin: oldPin, new_pin: newPin });
    // 인라인 메시지 초기화
    msg.textContent = "";
    // 토스트 팝업
    showToast(`✅ <strong>${name}</strong>님의 PIN이 변경되었습니다.<br>새 PIN으로 로그인해 주세요.`, "success");
    if ($("cpName")) $("cpName").value = "";
    $("cpOldPin").value = "";
    $("cpNewPin").value = "";
    $("cpNewPin2").value = "";
  } catch (e) {
    msg.textContent = "";
    showToast(`❌ ${e.message}<br>현재 PIN을 다시 확인해 주세요.`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "변경하기";
  }
}

async function tryAutoLogin() {
  if (!S.token) return false;
  try {
    S.member = await api("GET", "/api/me");
    return true;
  } catch {
    S.token = null;
    localStorage.removeItem("smc_token");
    return false;
  }
}

/* ── App entry ────────────────────────────────────────── */
function enterApp() {
  $("loginOverlay").classList.add("hidden");
  $("app").classList.remove("hidden");

  // 로그인한 사람에 맞게 사용자별 데이터 초기화
  S.tasks = [];
  S.recurring = [];
  S.weekTasks = [];
  S.taskTargetMemberId = null; // null = 본인, 파트장/팀장이 타인 업무 관리 시 해당 member_id

  const { year, week } = todayYW();
  S.dash = { year, week };
  S.team = { year, week, part: "전체" };
  S.comp = { year, week };
  const now = new Date();
  S.cal = { year: now.getFullYear(), month: now.getMonth() + 1 };
  S.calSearchMemberId = null;

  // Show admin tab if admin
  if (S.member.role === "admin") {
    document.querySelector(".tab-admin").classList.remove("hidden");
  }
  // 제출 현황 탭: 팀장(admin) · 파트장(leader)만 표시
  if (S.member.role === "admin" || S.member.role === "leader") {
    document.querySelector(".tab-btn[data-tab='team']")?.classList.remove("hidden");
  } else {
    document.querySelector(".tab-btn[data-tab='team']")?.classList.add("hidden");
  }

  updateHeaderUser();
  fetchMembers().then(() => {
    switchTab("dashboard");
    startPolling();
  });
}

function updateHeaderUser() {
  $("headerUser").textContent = `${S.member.name} · ${S.member.part}`;
}

/* ── Tab switching ────────────────────────────────────── */
function switchTab(tab) {
  S.currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach((s) => {
    s.classList.toggle("active", s.id === `tab-${tab}`);
    s.classList.toggle("hidden", s.id !== `tab-${tab}`);
  });
  if (tab === "dashboard") renderDashboard();
  else if (tab === "team") renderTeam();
  else if (tab === "calendar") renderCalendar();
  else if (tab === "archive") renderArchive();
  else if (tab === "compilation") {
    if (!S.comp.year) S.comp = { year: S.dash.year, week: S.dash.week };
    renderCompilation();
  }
  else if (tab === "admin") openAdminTab();
}

/* ── Members cache ────────────────────────────────────── */
async function fetchMembers() {
  S.members = await api("GET", "/api/members");
}

/* ── Dashboard ────────────────────────────────────────── */
function renderDashWeekHeader() {
  const { year, week } = S.dash;
  $("dashWeekLabel").textContent = weekLabel(year, week);
  // 연도 진행률
  const ws = weekStart(year, week);
  const jan1 = new Date(year, 0, 1);
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeap ? 366 : 365;
  const dayNum = Math.round((ws - jan1) / 86400000) + 1;
  const pct = Math.min(100, Math.max(0, Math.round((dayNum / totalDays) * 100)));
  const fill = $("yearProgressFill");
  const lbl  = $("yearProgressLabel");
  if (fill) fill.style.width = pct + "%";
  if (lbl)  lbl.textContent = `${year}년 ${pct}% 경과`;
  // 루틴 업무 마감 알림
  renderRoutineDueBanner(year, week);
}

/* ── 루틴 업무 이번 주 마감 여부 체크 ──────────────────────── */
function getRoutineTasksDueThisWeek(year, week) {
  const ws = weekStart(year, week);
  const we = weekEnd(year, week);
  const today = new Date();

  return (S.tasks || []).filter((t) => {
    if (!t.cycle || t.cycle === "연중") return false; // 연중은 상시 진행 → 알림 불필요
    if (t.cycle === "매일") return true;
    const day = t.cycle_day;

    if (t.cycle === "매주") return true;

    if (t.cycle === "매월" && day) {
      // 해당 day가 이번 주 안에 포함되는지
      return _dayInWeek(day, ws, we);
    }
    if (t.cycle === "분기별" && day) {
      const m = today.getMonth() + 1; // 1-based
      if (![1,4,7,10].includes(m)) return false;
      return _dayInWeek(day, ws, we);
    }
    if (t.cycle === "반기별" && day) {
      const m = today.getMonth() + 1;
      if (![1,7].includes(m)) return false;
      return _dayInWeek(day, ws, we);
    }
    if (t.cycle === "매년") {
      if (!day) return false;
      // cycle_month가 있으면 그 월인지도 체크
      if (t.cycle_month) {
        const thisMonth = today.getMonth() + 1;
        // 이번 주가 해당 월에 걸쳐 있는지
        const wsMonth = ws.getMonth() + 1, weMonth = we.getMonth() + 1;
        if (t.cycle_month !== wsMonth && t.cycle_month !== weMonth) return false;
      }
      return _dayInWeek(day, ws, we);
    }
    return false;
  });
}

function _dayInWeek(day, ws, we) {
  // day(1~31)가 ws~we 사이 날짜에 해당하는지
  for (let d = new Date(ws); d <= we; d = new Date(d.getTime() + 86400000)) {
    if (d.getDate() === day) return true;
  }
  return false;
}

/* 루틴 업무의 실제 처리 예정일 계산 (주기일 + 휴일 조정) */
function calcRoutineDueDate(task, year, week) {
  if (!task.cycle_day) return "";
  const ws = weekStart(year, week);
  const we = weekEnd(year, week);

  // 이번 주 안에서 cycle_day와 일치하는 날 찾기
  let target = null;
  for (let d = new Date(ws); d <= we; d = new Date(d.getTime() + 86400000)) {
    if (d.getDate() === task.cycle_day) { target = new Date(d); break; }
  }
  if (!target) return "";

  // 휴일(토·일) 조정
  const adj = task.holiday_adjust || "none";
  if (adj !== "none") {
    const dow = target.getDay(); // 0=일, 6=토
    if (dow === 0) { // 일요일
      target = new Date(target.getTime() + (adj === "after" ? 1 : -2) * 86400000);
    } else if (dow === 6) { // 토요일
      target = new Date(target.getTime() + (adj === "after" ? 2 : -1) * 86400000);
    }
  }
  return dateKey(target);
}

function renderRoutineDueBanner(year, week) {
  const banner = $("routineDueBanner");
  if (!banner) return;

  const due = getRoutineTasksDueThisWeek(year, week);
  if (!due.length) { banner.classList.add("hidden"); return; }

  // 이미 이번 주 업무에 추가된 항목 제외
  const addedTexts = new Set((S.weekTasks || []).map((w) => w.text));
  const pending = due.filter((t) => !addedTexts.has(t.cat2 || t.category || t.title || ""));
  if (!pending.length) { banner.classList.add("hidden"); return; }

  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div class="routine-due-banner-head">
      <div class="routine-due-banner-title">
        🔔 이번 주에 처리해야 할 루틴 업무 ${pending.length}건
      </div>
      <button class="routine-due-banner-close" id="routineBannerClose">✕</button>
    </div>
    <div class="routine-due-items">
      ${pending.map((t) => {
        const cat1 = t.cat1 ? `<span style="font-weight:800">${esc(t.cat1)}</span> › ` : "";
        const cat2 = esc(t.cat2 || t.category || t.title || "");
        const dueDate = calcRoutineDueDate(t, year, week);
        // 날짜 표시: 원래 주기일 + 조정된 실제 날짜
        let dayStr = t.cycle
          + (t.cycle === "매년" && t.cycle_month ? ` ${t.cycle_month}월` : "")
          + (t.cycle_day ? ` ${t.cycle_day}일` : "");
        let dateTag = "";
        if (dueDate) {
          const d = new Date(dueDate);
          const fmted = `${d.getMonth()+1}/${d.getDate()}`;
          const origDay = t.cycle_day;
          const adjDay  = d.getDate();
          if (t.holiday_adjust !== "none" && origDay !== adjDay) {
            dateTag = `<span class="routine-due-adj-date">${fmted} (조정됨)</span>`;
          } else {
            dateTag = `<span class="routine-due-adj-date">${fmted}</span>`;
          }
        }
        return `<div class="routine-due-item" data-id="${t.id}" data-date="${dueDate}">
          <span class="routine-due-item-label">${cat1}${cat2}</span>
          <span class="routine-due-item-day">${dayStr}${dateTag}</span>
          <button class="routine-due-item-add" data-id="${t.id}">+ 이번 주 추가</button>
        </div>`;
      }).join("")}
    </div>
  `;

  $("routineBannerClose").addEventListener("click", () => banner.classList.add("hidden"));

  banner.querySelectorAll(".routine-due-item-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("added")) return;
      const task = S.tasks.find((t) => t.id === btn.dataset.id);
      if (!task) return;
      const itemEl = btn.closest(".routine-due-item");
      const autoDate = itemEl?.dataset.date || "";
      S.weekTasks.push({
        text: task.category || task.title,
        status: "in_progress",
        date: autoDate,          // 주기일 (휴일 조정 포함) 자동 세팅
        cat1: task.cat1 || "", cat2: task.category || "",
      });
      renderWeekTasksList();
      btn.textContent = "✓ 추가됨";
      btn.classList.add("added");
    });
  });
}

/* 구형 보고서(last_results/next_plans)와 신형(tasks) 하위호환 헬퍼 */
function getReportTasks(r) {
  if (Array.isArray(r.tasks)) return r.tasks;
  // 구형 포맷: last_results + next_plans 병합
  return [...(r.last_results || []), ...(r.next_plans || [])];
}

function renderBirthdayBanner() {
  // Remove existing banner if any
  const existing = document.getElementById("birthdayBanner");
  if (existing) existing.remove();

  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayMD = `${mm}-${dd}`;

  const birthdays = S.members.filter((m) => {
    if (!m.birthday) return false;
    return m.birthday.slice(5) === todayMD; // MM-DD 비교
  });

  if (birthdays.length === 0) return;

  const banner = document.createElement("div");
  banner.id = "birthdayBanner";
  banner.className = "birthday-banner";
  const names = birthdays.map((m) => {
    const year = m.birthday ? parseInt(m.birthday.slice(0, 4), 10) : null;
    const age = year ? today.getFullYear() - year + 1 : null; // 한국 나이
    return `${m.name}${age ? ` (만 ${today.getFullYear() - year}세)` : ""}`;
  }).join(", ");
  banner.innerHTML = `
    <div class="bday-icon">🎂</div>
    <div class="bday-text">
      <div class="bday-title">오늘 생일인 팀원이 있어요!</div>
      <div class="bday-names">${esc(names)} — 생일을 축하합니다! 🎉</div>
    </div>
  `;

  // Insert before status badge
  const badge = $("reportStatusBadge");
  badge.parentNode.insertBefore(banner, badge);
}

function renderWeekSubmitGuard() {
  const prev = document.getElementById("weekSubmitGuard");
  if (prev) prev.remove();
  if (!S.reportSubmitted) return;
  const guard = document.createElement("div");
  guard.id = "weekSubmitGuard";
  guard.className = "week-submit-guard";
  guard.innerHTML = `
    <span class="wsg-icon">✓</span>
    <span class="wsg-msg">제출 완료된 업무입니다. 추가·삭제는 불가합니다. 수정이 필요하면 상단 <strong>제출 취소</strong> 버튼을 이용하세요.</span>
  `;
  const container = $("weekTasksList");
  if (container) container.parentNode.insertBefore(guard, container);
}

async function renderDashboard() {
  renderDashWeekHeader();
  renderBirthdayBanner();
  renderTaskTargetSelector();
  const { year, week } = S.dash;
  try {
    const reports = await api("GET", `/api/reports?year=${year}&week=${week}&memberId=${S.member.id}`);
    const report = reports[0] || null;
    S.reportSubmitted = report?.submitted || false;
    const badge = $("reportStatusBadge");
    if (report) {
      S.weekTasks = getReportTasks(report);
      $("reportNote").value = report.note || "";
      if (report.submitted) {
        badge.className = "status-badge submitted";
        badge.textContent = "✓ 제출 완료";
      } else {
        badge.className = "status-badge draft";
        badge.textContent = "📝 임시저장 중 (미제출)";
      }
      badge.classList.remove("hidden");
      $("submitReport").textContent = report.submitted ? "제출 취소" : "제출하기";
    } else {
      S.weekTasks = [];
      $("reportNote").value = "";
      badge.className = "status-badge pending";
      badge.textContent = "⚠ 업무 미입력";
      badge.classList.remove("hidden");
      $("submitReport").textContent = "제출하기";
    }
    renderWeekTasksList();
    renderWeekSubmitGuard();
    await renderMyTasks();
    renderMyFeedbacks();
  } catch (e) {
    console.error(e);
  }
}

/* ── 이번 주 업무 리스트 (단일) ─────────────────────────── */
const _WEEK_STATUSES  = ["in_progress", "done", "hold"];
const _WEEK_STATUS_LBL = { in_progress: "진행중", done: "완료", hold: "보류" };
const _WEEK_LEGACY    = { pending: "in_progress", partial: "hold" };  // waiting은 이제 '계획' 활성 상태
const _WEEK_ORDER     = { waiting: 0, in_progress: 1, hold: 2, done: 3 };

function renderWeekTasksList() {
  const container = $("weekTasksList");
  if (!container) return;
  container.innerHTML = "";

  if (S.weekTasks.length === 0) {
    container.innerHTML = '<div class="task-list-empty">직접 입력하거나 루틴 업무 리스트·지난 주 업무를 불러오세요.</div>';
    return;
  }

  // 정렬: 진행중 → 보류 → 완료 (상태별 색상으로 구분, 별도 섹션헤더 없음)
  const sorted = S.weekTasks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const sa = _WEEK_ORDER[_WEEK_LEGACY[a.t.status] || a.t.status || "in_progress"] ?? 0;
      const sb = _WEEK_ORDER[_WEEK_LEGACY[b.t.status] || b.t.status || "in_progress"] ?? 0;
      return sa - sb;
    });

  sorted.forEach(({ t, i }) => container.appendChild(createWeekTaskItem(t, i)));
  updateRoutineBannerBtns();
}

/* 배너 추가 버튼 상태 동기화 — weekTasks 변경 시 호출 */
function updateRoutineBannerBtns() {
  const banner = $("routineDueBanner");
  if (!banner || banner.classList.contains("hidden")) return;
  banner.querySelectorAll(".routine-due-item-add").forEach((btn) => {
    const task = (S.tasks || []).find((t) => t.id === btn.dataset.id);
    if (!task) return;
    const taskText = task.cat2 || task.category || task.title || "";
    const stillAdded = S.weekTasks.some((w) => w.text === taskText);
    if (stillAdded) {
      btn.textContent = "✓ 추가됨";
      btn.classList.add("added");
    } else {
      btn.textContent = "+ 이번 주 추가";
      btn.classList.remove("added");
    }
  });
}

function createWeekTaskItem(item, idx) {
  const rawStatus = item.status || "in_progress";
  const current   = _WEEK_LEGACY[rawStatus] || rawStatus;
  const cat1      = item.cat1 || "";
  const cat2      = item.cat2 || "";
  const subs      = item.subtasks || [];
  const hasCat    = !!(cat1 || cat2);

  const div = document.createElement("div");
  div.className = "task-item";
  div.dataset.idx = idx;

  const inner = document.createElement("div");
  inner.className = "week-task-inner";

  let _updateLayout = () => {};  // 세부업무 토글 시 레이아웃 갱신 (하단에서 정의)
  let catRow = null;

  // ── 카테고리 헤더 (cat1 › cat2) ──
  if (hasCat) {
    catRow = document.createElement("div");
    catRow.className = "week-task-cat-row";
    const catHeader = document.createElement("div");
    catHeader.className = "week-task-cat";
    const parts = [cat1, cat2].filter(Boolean);
    catHeader.innerHTML = parts.map((p, i) =>
      i === 0
        ? `<span class="wtc-cat1">${esc(p)}</span>`
        : `<span class="wtc-sep">›</span><span class="wtc-cat2">${esc(p)}</span>`
    ).join("");
    catRow.appendChild(catHeader);
    inner.appendChild(catRow);
  }

  // ── 텍스트 입력 (카테고리 없을 때만 표시) ──
  const ta = document.createElement("textarea");
  ta.value = item.text || "";
  ta.placeholder = "업무 내용을 입력하세요.";
  ta.className = hasCat ? "week-task-ta has-cat" : "week-task-ta";
  ta.rows = hasCat ? 1 : 2;
  if (hasCat) ta.style.display = "none"; // cat1›cat2가 라벨 역할 → 중복 텍스트 숨김
  ta.addEventListener("input", (e) => {
    S.weekTasks[idx].text = e.target.value;
    autoResize(e.target);
  });
  setTimeout(() => autoResize(ta), 0);
  inner.appendChild(ta);

  // ── 세부업무 영역 (편집 가능) ──
  if (!S.weekTasks[idx].subtasks) S.weekTasks[idx].subtasks = [];

  const subsWrap = document.createElement("div");
  subsWrap.className = "week-task-subs-wrap";

  function rebuildSubs() {
    subsWrap.innerHTML = "";
    const curSubs = S.weekTasks[idx].subtasks || [];

    if (curSubs.length > 0) {
      const subList = document.createElement("div");
      subList.className = "week-task-subs";
      curSubs.forEach((s, si) => {
        const sStatus = s.status || (s.done ? "done" : "in_progress");
        const cls = { waiting: "sub-wait", in_progress: "sub-prog", done: "sub-done" }[sStatus] || "sub-prog";
        const lbl = { waiting: "대기", in_progress: "진행중", done: "완료" }[sStatus] || "진행중";

        const row = document.createElement("div");
        row.className = "week-task-sub-row" + (sStatus === "done" ? " done" : "");

        const dot = document.createElement("span");
        dot.className = `wts-dot ${cls}`;

        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "wts-input";
        inp.value = s.text || "";
        inp.placeholder = "세부업무 내용";
        // 초기 상태: 내용 있으면 filled 스타일
        if (s.text?.trim()) inp.classList.add("filled");
        if (S.reportSubmitted) {
          inp.readOnly = true;
          inp.style.cssText = "background:transparent;border-color:transparent;color:var(--muted);cursor:default;font-weight:500;";
        }
        inp.addEventListener("input", (e) => {
          if (S.reportSubmitted) { e.target.value = S.weekTasks[idx].subtasks[si].text; return; }
          S.weekTasks[idx].subtasks[si].text = e.target.value;
          inp.classList.toggle("filled", !!e.target.value.trim());
        });
        inp.addEventListener("keydown", (e) => {
          if (S.reportSubmitted) { e.preventDefault(); return; }
          if (e.key === "Enter" && !e.isComposing) {
            e.preventDefault();
            S.weekTasks[idx].subtasks.push({ id: genLocalId(), text: "", status: "in_progress", done: false });
            rebuildSubs();
            const inputs = subsWrap.querySelectorAll(".wts-input");
            if (inputs.length) inputs[inputs.length - 1].focus();
          }
        });

        // 세부업무 날짜 입력 (wrapper)
        const dateWrap = document.createElement("div");
        dateWrap.className = "wts-date-wrap";

        const dateLbl = document.createElement("span");
        dateLbl.className = "wts-date-label";

        const dateIn = document.createElement("input");
        dateIn.type = "date";
        dateIn.className = "wts-date";
        dateIn.value = s.due_date || "";

        // 날짜 라벨·색상: 완료=완료일자(초록), 진행=목표일자(주황, 초과시 빨강), 계획=대기
        const applyDateState = (val, st) => {
          const today = dateKey(new Date());
          const isOverdue = val && st !== "done" && val < today;
          dateIn.classList.toggle("overdue", isOverdue);
          if (st === "done") {
            dateLbl.textContent = "완료일자";
            dateLbl.classList.remove("visible-warn");
            dateLbl.classList.toggle("visible", !!val);
            dateLbl.classList.add("done-lbl");
          } else if (st === "in_progress") {
            dateLbl.textContent = "목표일자";
            dateLbl.classList.remove("done-lbl");
            dateLbl.classList.toggle("visible", !!val);
          } else {
            dateLbl.textContent = "목표일자";
            dateLbl.classList.remove("done-lbl");
            dateLbl.classList.toggle("visible", !!val);
          }
        };
        applyDateState(s.due_date || "", sStatus);
        dateIn.addEventListener("change", (e) => {
          S.weekTasks[idx].subtasks[si].due_date = e.target.value;
          const cur = S.weekTasks[idx].subtasks[si].status || "in_progress";
          applyDateState(e.target.value, cur);
        });

        dateWrap.appendChild(dateLbl);
        dateWrap.appendChild(dateIn);
        // 진행 상태면 날짜 숨김
        dateWrap.style.display = sStatus === "in_progress" ? "none" : "";

        // 상태 3버튼 (계획 / 진행 / 완료)
        const stGroup = document.createElement("div");
        stGroup.className = "wts-st-group";
        const SUB_STS = [
          { key: "waiting",     label: "계획" },
          { key: "in_progress", label: "진행" },
          { key: "done",        label: "완료" },
        ];
        SUB_STS.forEach(({ key, label }) => {
          const btn = document.createElement("button");
          btn.className = "wts-st-btn wts-st-" + key + (sStatus === key ? " active" : "");
          btn.dataset.stkey = key;
          btn.textContent = label;
          btn.addEventListener("click", () => {
            S.weekTasks[idx].subtasks[si].status = key;
            S.weekTasks[idx].subtasks[si].done = (key === "done");
            stGroup.querySelectorAll(".wts-st-btn").forEach(b =>
              b.classList.toggle("active", b.dataset.stkey === key)
            );
            row.className = "week-task-sub-row" + (key === "done" ? " done" : "");
            applyDateState(S.weekTasks[idx].subtasks[si].due_date || "", key);
            // 진행 상태면 날짜 숨김, 계획·완료면 표시
            dateWrap.style.display = key === "in_progress" ? "none" : "";
          });
          stGroup.appendChild(btn);
        });

        const delBtn = document.createElement("button");
        delBtn.className = "wts-sub-del";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", () => {
          if (S.reportSubmitted) {
            showToast("⚠️ 이미 제출된 업무입니다. 삭제할 수 없습니다.", "error");
            return;
          }
          S.weekTasks[idx].subtasks.splice(si, 1);
          rebuildSubs();
        });

        row.appendChild(dot);
        row.appendChild(inp);
        row.appendChild(dateWrap);
        row.appendChild(stGroup);
        row.appendChild(delBtn);
        subList.appendChild(row);
      });
      subsWrap.appendChild(subList);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "wts-add-btn";
    addBtn.textContent = "+ 세부업무 추가";
    addBtn.addEventListener("click", () => {
      S.weekTasks[idx].subtasks.push({ id: genLocalId(), text: "", status: "in_progress", done: false });
      rebuildSubs();
      const inputs = subsWrap.querySelectorAll(".wts-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    subsWrap.appendChild(addBtn);
    _updateLayout();
  }

  rebuildSubs();
  inner.appendChild(subsWrap);

  // ── 날짜 입력 ──
  const dateIn = document.createElement("input");
  dateIn.type = "date";
  dateIn.className = "task-date";
  dateIn.value = item.date || "";
  function applyDateStyle(st) {
    if (st === "done") {
      dateIn.title             = "완료일";
      dateIn.style.borderColor = "var(--good)";
      dateIn.placeholder       = "완료일";
    } else if (st === "in_progress") {
      dateIn.title             = "목표기한";
      dateIn.style.borderColor = "#f59e0b";
      dateIn.placeholder       = "목표기한";
    } else {
      dateIn.title             = "마감일";
      dateIn.style.borderColor = "";
      dateIn.placeholder       = "마감일";
    }
    dateIn.style.display = "";
  }
  applyDateStyle(current);
  inner.appendChild(dateIn);

  // ── 액션 버튼 ──
  const actions = document.createElement("div");
  actions.className = "task-item-actions";

  const statusBtn = document.createElement("button");
  statusBtn.className = `task-status ${current}`;
  statusBtn.textContent = _WEEK_STATUS_LBL[current];
  function syncStatusBtnVisibility(st, dateVal) {
    statusBtn.style.display = (st === "in_progress" && dateVal) ? "none" : "";
  }
  syncStatusBtnVisibility(current, item.date || "");
  dateIn.addEventListener("change", (e) => {
    S.weekTasks[idx].date = e.target.value;
    const cur2 = _WEEK_LEGACY[S.weekTasks[idx].status] || S.weekTasks[idx].status || "in_progress";
    syncStatusBtnVisibility(cur2, e.target.value);
  });
  statusBtn.addEventListener("click", () => {
    const cur = _WEEK_LEGACY[S.weekTasks[idx].status] || S.weekTasks[idx].status || "in_progress";
    const nxt = _WEEK_STATUSES[(_WEEK_STATUSES.indexOf(cur) + 1) % _WEEK_STATUSES.length];
    S.weekTasks[idx].status = nxt;
    statusBtn.className = `task-status ${nxt}`;
    statusBtn.textContent = _WEEK_STATUS_LBL[nxt];
    applyDateStyle(nxt);
    syncStatusBtnVisibility(nxt, S.weekTasks[idx].date || "");
  });

  const del = document.createElement("button");
  del.className = "btn-danger";
  del.textContent = "✕";
  del.addEventListener("click", () => {
    if (S.reportSubmitted) {
      showToast("⚠️ 이미 제출된 업무입니다. 삭제할 수 없습니다.", "error");
      return;
    }
    S.weekTasks.splice(idx, 1);
    renderWeekTasksList();
  });

  actions.appendChild(statusBtn);
  if (!hasCat) actions.appendChild(del); // hasCat이면 del을 catRow 인라인으로 이동

  // ── 인라인 컨트롤 (hasCat이면 항상 catRow 우측에 표시) ──
  if (hasCat && catRow) {
    div.classList.add("task-has-cat");
    const inlineCtrl = document.createElement("div");
    inlineCtrl.className = "wtc-inline-controls";

    const iDate = document.createElement("input");
    iDate.type = "date";
    iDate.className = "wtc-inline-date";
    iDate.value = item.date || "";

    const iDateWrap = document.createElement("div");
    iDateWrap.className = "wts-date-wrap";
    const iDateLbl = document.createElement("span");
    iDateLbl.className = "wts-date-label";
    const applyInlineDateLbl = (val, st) => {
      iDateLbl.textContent = st === "done" ? "완료일자" : "목표일자";
      iDateLbl.classList.remove("done-lbl");
      if (st === "done") iDateLbl.classList.add("done-lbl");
      iDateLbl.classList.toggle("visible", !!val);
    };
    applyInlineDateLbl(item.date || "", current);
    iDateWrap.appendChild(iDateLbl);
    iDateWrap.appendChild(iDate);
    // 진행 상태면 날짜 숨김
    iDateWrap.style.display = current === "in_progress" ? "none" : "";

    iDate.addEventListener("change", (e) => {
      S.weekTasks[idx].date = e.target.value;
      dateIn.value = e.target.value;
      const cur = _WEEK_LEGACY[S.weekTasks[idx].status] || S.weekTasks[idx].status || "in_progress";
      applyDateStyle(cur);
      applyInlineDateLbl(e.target.value, cur);
      syncStatusBtnVisibility(cur, e.target.value);
    });
    inlineCtrl.appendChild(iDateWrap);

    [
      { key: "waiting",     label: "계획" },
      { key: "in_progress", label: "진행" },
      { key: "done",        label: "완료" },
    ].forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.className = "wtc-st-btn wtc-st-" + key;
      btn.dataset.stkey = key;
      btn.textContent = label;
      if (current === key) btn.classList.add("active");
      btn.addEventListener("click", () => {
        S.weekTasks[idx].status = key;
        inlineCtrl.querySelectorAll(".wtc-st-btn").forEach(b =>
          b.classList.toggle("active", b.dataset.stkey === key)
        );
        applyDateStyle(key);
        applyInlineDateLbl(S.weekTasks[idx].date || "", key);
        statusBtn.className = `task-status ${key}`;
        statusBtn.textContent = _WEEK_STATUS_LBL[key];
        syncStatusBtnVisibility(key, S.weekTasks[idx].date || "");
        // 진행 상태면 날짜 숨김, 계획·완료면 표시
        iDateWrap.style.display = key === "in_progress" ? "none" : "";
      });
      inlineCtrl.appendChild(btn);
    });

    inlineCtrl.appendChild(del); // × 버튼을 catRow 우측에 배치
    catRow.appendChild(inlineCtrl);
  }

  // ── 레이아웃 토글 ───────────────────────────────────────────────────
  function updateLayout() {
    const hasSubtasks = (S.weekTasks[idx].subtasks || []).length > 0;
    div.classList.toggle("task-no-subs", hasCat && !hasSubtasks);
  }
  _updateLayout = updateLayout;
  updateLayout();

  div.appendChild(inner);
  div.appendChild(actions);
  return div;
}

function autoResize(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

async function saveReport(submitted = false) {
  const { year, week } = S.dash;
  const { month } = todayYW();
  const btn = submitted ? $("submitReport") : $("saveReport");
  btn.disabled = true;
  btn.textContent = submitted ? "제출 중..." : "저장 중...";
  let finalSubmitted;
  try {
    const resBefore = await api("GET", `/api/reports?year=${year}&week=${week}&memberId=${S.member.id}`);
    const alreadySubmitted = resBefore[0]?.submitted || false;
    finalSubmitted = submitted ? !alreadySubmitted : undefined;

    await api("POST", "/api/reports", {
      year,
      week,
      month,
      tasks: S.weekTasks,
      note: $("reportNote").value,
      ...(finalSubmitted !== undefined && { submitted: finalSubmitted }),
    });
    if (submitted) {
      $("saveStatus").textContent = finalSubmitted ? "✓ 제출되었습니다." : "↩ 제출이 취소되었습니다.";
    } else {
      $("saveStatus").textContent = "✓ 임시저장 완료";
    }
    setTimeout(() => ($("saveStatus").textContent = ""), 3000);

    // 제출 상태 즉시 UI 반영 (renderDashboard 완료 전에 버튼·배지 선반영)
    if (submitted) {
      S.reportSubmitted = !!finalSubmitted;
      btn.textContent = finalSubmitted ? "제출 취소" : "제출하기";
      const badge = $("reportStatusBadge");
      if (badge) {
        if (finalSubmitted) {
          badge.className = "status-badge submitted";
          badge.textContent = "✓ 제출 완료";
          badge.classList.remove("hidden");
        } else {
          badge.className = "status-badge draft";
          badge.textContent = "📝 임시저장 중 (미제출)";
          badge.classList.remove("hidden");
        }
      }
      renderWeekSubmitGuard();
    }

    renderDashboard();
  } catch (e) {
    $("saveStatus").textContent = "오류: " + e.message;
    btn.textContent = submitted ? (finalSubmitted ? "제출 취소" : "제출하기") : "임시저장";
  } finally {
    btn.disabled = false;
    if (finalSubmitted === undefined) {
      // 임시저장 버튼
      btn.textContent = "임시저장";
    }
    // submitted 버튼 텍스트는 위 try 블록에서 이미 처리
  }
}

/* ── Team view ────────────────────────────────────────── */
async function renderTeam(silent = false) {
  const { year, week } = S.team;
  const _tws = weekStart(year, week), _twe = weekEnd(year, week);
  const _tdr = `${_tws.getMonth()+1}월 ${_tws.getDate()}일 ~ ${_twe.getMonth()+1}월 ${_twe.getDate()}일`;
  $("teamWeekLabel").innerHTML = `${year}년 ${week}주차<span class="week-date-range">${_tdr}</span>`;

  // 파트장(leader)은 본인 파트만, 팀장(admin)은 전체
  const isTeamAdmin = S.member.role === "admin";
  const myPart = S.member.part;

  // Part filter chips (팀장만 파트 필터 사용 가능)
  const pf = $("partFilter");
  pf.innerHTML = "";
  if (isTeamAdmin) {
    const parts = ["전체", ...new Set(S.members.map((m) => m.part).filter(p => p && p !== "경영지원팀"))];
    parts.forEach((p) => {
      const chip = document.createElement("button");
      chip.className = "part-chip" + (S.team.part === p ? " active" : "");
      chip.textContent = p;
      chip.addEventListener("click", () => {
        S.team.part = p;
        renderTeam();
      });
      pf.appendChild(chip);
    });
  } else {
    // 파트장: 파트 필터 칩 숨김, 자기 파트 라벨만 표시
    pf.innerHTML = `<span class="part-chip active" style="cursor:default">${esc(myPart)}</span>`;
  }

  const grid = $("teamGrid");
  if (!silent) grid.innerHTML = '<div class="loading">불러오는 중...</div>';
  setSyncBar("⟳ 갱신 중...", "loading");

  try {
    const reports = await api("GET", `/api/reports?year=${year}&week=${week}`);
    const reportMap = Object.fromEntries(reports.map((r) => [r.member_id, r]));

    // 팀장: 파트 필터 적용 / 파트장: 본인 파트만 (경영지원팀은 제출현황에서 제외)
    const filtered = S.members.filter((m) =>
      m.part !== "경영지원팀" && (
        isTeamAdmin
          ? (S.team.part === "전체" || m.part === S.team.part)
          : m.part === myPart
      )
    );
    const byPart = {};
    filtered.forEach((m) => {
      if (!byPart[m.part]) byPart[m.part] = [];
      byPart[m.part].push(m);
    });

    grid.innerHTML = "";

    // Summary row
    const inputted = filtered.filter((m) => reportMap[m.id]).length;
    const submittedCount = filtered.filter((m) => reportMap[m.id]?.submitted).length;
    const summaryRow = document.createElement("div");
    summaryRow.className = "summary-row";
    summaryRow.innerHTML = `
      <div class="summary-card"><div class="label">전체 팀원</div><div class="value">${filtered.length}명</div></div>
      <div class="summary-card"><div class="label">제출 완료</div><div class="value primary">${submittedCount}명</div></div>
      <div class="summary-card"><div class="label">임시저장</div><div class="value good">${inputted - submittedCount}명</div></div>
      <div class="summary-card"><div class="label">미입력</div><div class="value ${filtered.length - inputted > 0 ? "warn" : ""}">${filtered.length - inputted}명</div></div>
    `;
    grid.appendChild(summaryRow);

    Object.entries(byPart).forEach(([part, members]) => {
      const section = document.createElement("div");
      section.className = "team-part-section";
      const title = document.createElement("div");
      title.className = "team-part-title";
      title.textContent = part;
      section.appendChild(title);

      const cards = document.createElement("div");
      cards.className = "team-cards";
      members.forEach((m) => {
        const r = reportMap[m.id];
        const card = document.createElement("div");
        const isSubmitted = r?.submitted;
        card.className = "team-card " + (r ? (isSubmitted ? "submitted-official" : "submitted") : "not-submitted");
        const submitLabel = !r ? "미입력" : isSubmitted ? "제출완료" : "임시저장";
        const submitClass = !r ? "none" : isSubmitted ? "submitted" : "draft";

        // 업무 통계 (단일 tasks 기준)
        let inProgressCount = 0, doneCount = 0, holdCount = 0, totalCount = 0, preview = "—";
        if (r) {
          const rTasks = getReportTasks(r);
          totalCount = rTasks.length;
          rTasks.forEach((t) => {
            const st = _WEEK_LEGACY[t.status] || t.status || "in_progress";
            if (st === "in_progress") inProgressCount++;
            else if (st === "done") doneCount++;
            else holdCount++;
          });
          preview = rTasks[0]?.text || "—";
        }

        card.innerHTML = `
          <div class="team-card-head">
            <div>
              <div class="team-member-name">${esc(m.name)}</div>
              <div class="team-member-part">${esc(m.part)}</div>
            </div>
            <span class="team-submit-status ${submitClass}">${submitLabel}</span>
          </div>
          ${r ? `
            <div class="team-card-preview">${esc(preview.slice(0, 60))}${preview.length > 60 ? "…" : ""}</div>
            <div class="team-card-count">진행중 ${inProgressCount}건 · 완료 ${doneCount}건${holdCount ? ` · 보류 ${holdCount}건` : ""} <span style="color:var(--muted)">(총 ${totalCount}건)</span></div>
          ` : '<div class="team-card-preview" style="color:var(--muted)">아직 업무를 입력하지 않았습니다.</div>'}
        `;
        card.addEventListener("click", () => {
          const canEdit = S.member.role === "admin" || S.member.role === "leader";
          showReportDetail(m, r, year, week, canEdit);
        });
        cards.appendChild(card);
      });
      section.appendChild(cards);
      grid.appendChild(section);
    });
    setSyncBar(`✓ 마지막 갱신: ${fmtTime(new Date())}  (30초마다 자동 갱신)`, "ok");
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div>${esc(e.message)}</div>`;
    setSyncBar("⚠ 갱신 실패", "error");
  }
}

function showReportDetail(member, report, year, week, canEdit = false) {
  const modal = $("modal");
  const card = $("modalCard");
  const sLabel = { waiting: "계획", in_progress: "진행중", done: "완료", hold: "보류" };

  // 보기 모드 렌더
  function renderViewMode(rpt) {
    const tasks = getReportTasks(rpt || {});
    const groups = { in_progress: [], done: [], hold: [] };
    tasks.forEach((i) => {
      const st = _WEEK_LEGACY[i.status] || i.status || "in_progress";
      (groups[st] || groups.in_progress).push({ ...i, _st: st });
    });
    const renderGroup = (items) => items.map((i) => {
      let dateStr = "";
      if (i.date) {
        const d = i.date.slice(5).replace("-", "/");
        if (i._st === "in_progress") dateStr = `<span style="font-size:11px;color:#f59e0b;margin-left:6px;font-weight:600">목표: ${d}</span>`;
        else if (i._st === "done")   dateStr = `<span style="font-size:11px;color:var(--good);margin-left:6px">${d} 완료</span>`;
        else                         dateStr = `<span style="font-size:11px;color:var(--muted);margin-left:6px">${d}</span>`;
      }
      return `<div class="report-detail-item">
        <span class="detail-status ${i._st}">${sLabel[i._st]}</span>
        <span class="detail-text">${esc(i.text)}${dateStr}</span>
      </div>`;
    }).join("");
    const sections = [
      { key: "in_progress", label: "진행 중" },
      { key: "done",        label: "완료" },
      { key: "hold",        label: "보류" },
    ].filter(({ key }) => groups[key].length > 0);

    card.innerHTML = `
      <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>${esc(member.name)} · ${weekLabel(year, week)}</span>
        <div style="display:flex;gap:6px">
          ${canEdit ? `<button class="btn-ghost small" id="feedbackReportBtn">💬 피드백</button>` : ""}
          ${canEdit ? `<button class="btn-ghost small" id="editReportBtn">✏️ 수정</button>` : ""}
        </div>
      </div>
      <div class="report-detail-section">
        <h4>업무 현황 (${tasks.length}건)</h4>
        ${tasks.length === 0
          ? '<p style="color:var(--muted);font-size:13px">입력된 업무가 없습니다.</p>'
          : sections.map(({ key, label }) => `
              <div style="margin-bottom:10px">
                <div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin:8px 0 4px">${label}</div>
                ${renderGroup(groups[key])}
              </div>
            `).join("")
        }
      </div>
      ${rpt?.note ? `<div class="archive-note">📌 비고: ${esc(rpt.note)}</div>` : ""}
      <div class="modal-actions">
        <button class="btn-ghost" id="closeModal">닫기</button>
      </div>
    `;
    if (canEdit) {
      card.querySelector("#feedbackReportBtn")?.addEventListener("click", () => {
        openFeedbackModal(member, year, "weekly", week);
      });
      card.querySelector("#editReportBtn")?.addEventListener("click", () => renderEditMode(rpt));
    }
    card.querySelector("#closeModal")?.addEventListener("click", closeModal);
  }

  // 수정 모드 렌더 (admin/leader 전용)
  function renderEditMode(rpt) {
    let editTasks = [...getReportTasks(rpt || {})];

    function rebuild() {
      card.innerHTML = `
        <div class="modal-title" style="display:flex;align-items:center;justify-content:space-between">
          <span>✏️ ${esc(member.name)} 업무 수정</span>
          <span style="font-size:12px;color:var(--muted)">${weekLabel(year, week)}</span>
        </div>
        <div id="editTasksArea" class="task-list" style="margin-bottom:12px"></div>
        <button id="addEditTask" class="btn-ghost small" style="margin-bottom:16px">+ 업무 추가</button>
        <div class="form-field">
          <label style="font-size:12px;color:var(--muted)">특이사항 / 비고</label>
          <textarea id="editNote" rows="2" style="width:100%;border:1px solid var(--line-strong);border-radius:6px;padding:8px;font-size:13px;resize:vertical">${esc(rpt?.note || "")}</textarea>
        </div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn-ghost" id="cancelEditBtn">취소</button>
          <button class="btn-primary" id="saveEditBtn">저장</button>
        </div>
      `;

      // 업무 목록 렌더
      const area = card.querySelector("#editTasksArea");
      if (editTasks.length === 0) {
        area.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">업무가 없습니다.</div>';
      } else {
        editTasks.forEach((t, idx) => {
          const st = _WEEK_LEGACY[t.status] || t.status || "in_progress";
          const item = document.createElement("div");
          item.className = "task-item";

          const inner = document.createElement("div");
          inner.style.cssText = "flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;";

          const ta = document.createElement("textarea");
          ta.value = t.text || "";
          ta.placeholder = "업무 내용";
          ta.rows = 2;
          ta.addEventListener("input", (e) => { editTasks[idx].text = e.target.value; autoResize(e.target); });
          setTimeout(() => autoResize(ta), 0);

          const dateIn = document.createElement("input");
          dateIn.type = "date";
          dateIn.className = "task-date";
          dateIn.value = t.date || "";
          dateIn.addEventListener("change", (e) => { editTasks[idx].date = e.target.value; });
          (function applyEditDateStyle(s) {
            if (s === "done")        { dateIn.title = "완료일"; dateIn.placeholder = "완료일"; dateIn.style.borderColor = "var(--good)"; }
            else if (s === "in_progress") { dateIn.title = "목표기한"; dateIn.placeholder = "목표기한"; dateIn.style.borderColor = "#f59e0b"; }
            else                    { dateIn.title = "마감일";  dateIn.placeholder = "마감일";  dateIn.style.borderColor = ""; }
          })(st);

          inner.appendChild(ta);
          inner.appendChild(dateIn);

          const actions = document.createElement("div");
          actions.className = "task-item-actions";

          const statusBtn = document.createElement("button");
          statusBtn.className = `task-status ${st}`;
          statusBtn.textContent = _WEEK_STATUS_LBL[st];
          statusBtn.addEventListener("click", () => {
            const cur = _WEEK_LEGACY[editTasks[idx].status] || editTasks[idx].status || "in_progress";
            const nxt = _WEEK_STATUSES[(_WEEK_STATUSES.indexOf(cur) + 1) % _WEEK_STATUSES.length];
            editTasks[idx].status = nxt;
            statusBtn.className = `task-status ${nxt}`;
            statusBtn.textContent = _WEEK_STATUS_LBL[nxt];
            if (nxt === "done")        { dateIn.title = "완료일"; dateIn.placeholder = "완료일"; dateIn.style.borderColor = "var(--good)"; }
            else if (nxt === "in_progress") { dateIn.title = "목표기한"; dateIn.placeholder = "목표기한"; dateIn.style.borderColor = "#f59e0b"; }
            else                       { dateIn.title = "마감일";  dateIn.placeholder = "마감일";  dateIn.style.borderColor = ""; }
          });

          const del = document.createElement("button");
          del.className = "btn-danger";
          del.textContent = "✕";
          del.addEventListener("click", () => { editTasks.splice(idx, 1); rebuild(); });

          actions.appendChild(statusBtn);
          actions.appendChild(del);
          item.appendChild(inner);
          item.appendChild(actions);
          area.appendChild(item);
        });
      }

      card.querySelector("#addEditTask").addEventListener("click", () => {
        editTasks.push({ text: "", status: "in_progress" });
        rebuild();
      });
      card.querySelector("#cancelEditBtn").addEventListener("click", () => renderViewMode(rpt));
      card.querySelector("#saveEditBtn").addEventListener("click", async () => {
        const saveBtn = card.querySelector("#saveEditBtn");
        saveBtn.disabled = true;
        saveBtn.textContent = "저장 중...";
        try {
          const { month } = todayYW();
          const saved = await api("POST", "/api/reports", {
            year, week, month,
            tasks: editTasks,
            note: card.querySelector("#editNote").value,
            target_member_id: member.id,
          });
          // 저장 후 보기 모드로 전환
          renderViewMode(saved.report || { tasks: editTasks, note: card.querySelector("#editNote").value });
        } catch (e) {
          alert("저장 실패: " + e.message);
          saveBtn.disabled = false;
          saveBtn.textContent = "저장";
        }
      });
    }

    rebuild();
  }

  // 초기 렌더
  renderViewMode(report);
  modal.classList.remove("hidden");
}

function closeModal() {
  $("modal").classList.add("hidden");
}

/* ── Calendar ─────────────────────────────────────────── */
async function renderCalendar(silent = false) {
  const { year, month } = S.cal;
  $("calMonthLabel").textContent = `${year}년 ${month}월`;

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  // Fetch events + birthdays
  let events = [];
  try {
    events = await api("GET", `/api/events?start=${startDate}&end=${endDate}`);
  } catch {}

  // 실제 생일 이벤트가 있는 멤버 ID 집합 (중복 방지)
  const realBdayMemberIds = new Set(
    events.filter((e) => e.type === "birthday").map((e) => e.member_id)
  );

  // Add birthdays as virtual events (실제 이벤트 없는 멤버만)
  S.members.forEach((m) => {
    if (!m.birthday) return;
    if (realBdayMemberIds.has(m.id)) return; // 실제 이벤트 있으면 스킵
    const parts = m.birthday.split("-");
    if (parts.length !== 3) return;
    const bMonth = parseInt(parts[1], 10);
    const bDay = parseInt(parts[2], 10);
    if (bMonth === month) {
      events.push({
        id: `bday-${m.id}`,
        member_id: m.id,
        member: m,
        type: "birthday",
        start_date: `${year}-${String(month).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`,
        end_date: `${year}-${String(month).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`,
        note: "생일",
        isBirthday: true,
      });
    }
  });

  // 검색 필터 적용
  const filteredEvents = S.calSearchMemberId
    ? events.filter((e) => e.member_id === S.calSearchMemberId || (e.isBirthday && e.member?.id === S.calSearchMemberId))
    : events;

  buildCalendarGrid(year, month, firstDay, lastDay, filteredEvents);
  buildEventList(filteredEvents, startDate, endDate);
  buildEventMemberSelect();

  // 연간 뷰
  if (S.calSearchMemberId) {
    buildMemberYearView(S.calSearchMemberId, year);
  } else {
    const panel = $("calYearPanel");
    if (panel) panel.classList.add("hidden");
  }

  // 검색 입력창 상태 업데이트
  updateCalSearchUI();
}

// 캘린더 드래그앤드롭 — 현재 드래그 중인 이벤트 정보
let _calDrag = null; // { id, startDate, endDate }
let _calDropDone = false; // drop 직후 cell click 억제

function buildCalendarGrid(year, month, firstDay, lastDay, events) {
  const grid = $("calendarGrid");
  const holidays = getHolidays(year);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const headRow = document.createElement("div");
  headRow.className = "cal-head-row";
  days.forEach((d) => {
    const cell = document.createElement("div");
    cell.className = "cal-head-cell";
    cell.textContent = d;
    headRow.appendChild(cell);
  });

  // Group events by date
  const eventsByDate = {};
  events.forEach((e) => {
    const s = new Date(e.start_date + "T00:00:00");
    const en = new Date(e.end_date + "T00:00:00");
    for (let d = new Date(s); d <= en; d.setDate(d.getDate() + 1)) {
      const key = dateKey(d);
      if (!eventsByDate[key]) eventsByDate[key] = [];
      eventsByDate[key].push(e);
    }
  });

  // Start from Sunday before first day
  const startDow = firstDay.getDay(); // 0=Sun
  const calStart = new Date(firstDay);
  calStart.setDate(calStart.getDate() - startDow);

  const todayStr = dateKey(new Date());
  const weeks = [];
  let cur = new Date(calStart);
  while (cur.getMonth() + 1 <= month || cur <= lastDay) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur.getMonth() + 1 > month && cur > lastDay) break;
    if (weeks.length > 6) break;
  }

  const weeksEl = document.createElement("div");
  weeksEl.className = "cal-weeks";
  weeks.forEach((week) => {
    const weekEl = document.createElement("div");
    weekEl.className = "cal-week";
    week.forEach((d) => {
      const key = dateKey(d);
      const holName = holidays[key];
      const isSubst = holName === "대체공휴일";
      const cell = document.createElement("div");
      cell.className = "cal-cell" +
        (d.getMonth() + 1 !== month ? " other-month" : "") +
        (key === todayStr ? " today" : "") +
        (holName && !isSubst ? " public-holiday" : "") +
        (isSubst ? " subst-holiday" : "");

      // 음력 날짜
      const lunarDiv = document.createElement("div");
      const lunar = getLunarDate(d);
      if (lunar) {
        lunarDiv.className = "cal-lunar" + (lunar.day === 1 ? " new-month" : "");
        // Special lunar day names
        const specialLunar = (lunar.month === 1 && lunar.day === 1) ? "설날"
          : (lunar.month === 8 && lunar.day === 15) ? "추석"
          : (lunar.month === 1 && lunar.day === 15) ? "정월대보름"
          : null;
        lunarDiv.textContent = specialLunar || lunarStr(d);
      }
      cell.appendChild(lunarDiv);

      const dateDiv = document.createElement("div");
      dateDiv.className = "cal-date";
      dateDiv.textContent = d.getDate();
      cell.appendChild(dateDiv);

      // 공휴일 이름 표시
      if (holName && d.getMonth() + 1 === month) {
        const holDiv = document.createElement("div");
        holDiv.className = "cal-holiday-name";
        holDiv.textContent = holName;
        cell.appendChild(holDiv);
      }

      const evtsEl = document.createElement("div");
      evtsEl.className = "cal-events";
      const dayEvents = eventsByDate[key] || [];
      const isToday = key === todayStr;
      dayEvents.slice(0, 3).forEach((e) => {
        const evEl = document.createElement("div");
        const isTodayBday = e.type === "birthday" && isToday;
        evEl.className = `cal-event ${EVENT_TYPES[e.type]?.calClass || e.type}${isTodayBday ? " today-bday" : ""}`;
        const name = e.member?.name || "?";
        const icon = typeIcon(e.type);
        if (e.type === "birthday") {
          const bYear = e.member?.birthday ? parseInt(e.member.birthday.slice(0, 4), 10) : null;
          const age = bYear ? new Date(key).getFullYear() - bYear : null;
          const lunarTag = e.isLunar || e.repeat === "yearly_lunar" ? " (음)" : "";
          const isMobile = window.innerWidth <= 480;
          evEl.textContent = isMobile ? `🎂 ${name}${lunarTag}` : `🎂 ${name} 생일${lunarTag}`;
          evEl.title = `🎂 ${name}님 생일${lunarTag}${age ? ` · 만 ${age}세` : ""}`;
        } else {
          // 텍스트 span + 리사이즈 핸들 구조
          const txtSpan = document.createElement("span");
          txtSpan.className = "evt-text";
          txtSpan.textContent = `${icon} ${name} ${typeLabel(e.type)}`;
          evEl.title = `${name} · ${typeLabel(e.type)}${e.note ? " · " + e.note : ""}`;
          evEl.appendChild(txtSpan);
        }

        // ── 드래그앤드롭: 생일 제외 실제 이벤트만 이동/리사이즈 가능 ──
        const canDrag = !e.isBirthday && e.type !== "birthday";
        if (canDrag) {
          evEl.draggable = true;
          evEl.classList.add("draggable-event");

          // 이동 드래그 (이벤트 본체)
          evEl.addEventListener("dragstart", (evt) => {
            if (evt.target.classList.contains("cal-resize-handle")) return;
            _calDrag = { id: e.id, startDate: e.start_date, endDate: e.end_date, mode: "move" };
            evt.dataTransfer.effectAllowed = "move";
            evt.dataTransfer.setData("text/plain", e.id);
            evEl.classList.add("dragging");
            evt.stopPropagation();
          });
          evEl.addEventListener("dragend", () => {
            evEl.classList.remove("dragging");
          });

          // 리사이즈 핸들 (오른쪽 끝 — 마지막 날 칸에만 표시)
          if (key === e.end_date) {
            const resizeHandle = document.createElement("span");
            resizeHandle.className = "cal-resize-handle";
            resizeHandle.draggable = true;
            resizeHandle.title = "드래그하여 기간 연장/단축";
            resizeHandle.addEventListener("dragstart", (evt) => {
              evt.stopPropagation();
              _calDrag = { id: e.id, startDate: e.start_date, endDate: e.end_date, mode: "resize" };
              evt.dataTransfer.effectAllowed = "move";
              evt.dataTransfer.setData("text/plain", e.id);
              resizeHandle.classList.add("resizing");
            });
            resizeHandle.addEventListener("dragend", () => {
              resizeHandle.classList.remove("resizing");
            });
            evEl.appendChild(resizeHandle);
          }
        }

        evtsEl.appendChild(evEl);
      });
      if (dayEvents.length > 3) {
        const more = document.createElement("div");
        more.className = "cal-event";
        more.style.cssText = "background:var(--bg);color:var(--muted);font-size:10px";
        more.textContent = `+${dayEvents.length - 3}개 더`;
        evtsEl.appendChild(more);
      }
      cell.appendChild(evtsEl);

      // ── 드롭 대상 ──
      cell.addEventListener("dragover", (evt) => {
        if (!_calDrag) return;
        // 리사이즈: 시작일 이전 칸은 drop 불가
        if (_calDrag.mode === "resize" && key < _calDrag.startDate) return;
        evt.preventDefault();
        evt.dataTransfer.dropEffect = "move";
        cell.classList.add(_calDrag.mode === "resize" ? "drag-over-resize" : "drag-over");
      });
      cell.addEventListener("dragleave", (evt) => {
        if (!evt.currentTarget.contains(evt.relatedTarget)) {
          cell.classList.remove("drag-over");
          cell.classList.remove("drag-over-resize");
        }
      });
      cell.addEventListener("drop", async (evt) => {
        evt.preventDefault();
        cell.classList.remove("drag-over");
        cell.classList.remove("drag-over-resize");
        if (!_calDrag) return;
        const { id, startDate, endDate, mode } = _calDrag;
        _calDrag = null;

        let newStart, newEnd;
        if (mode === "resize") {
          if (key < startDate) return; // 시작일 이전은 무시
          if (key === endDate) return;  // 변화 없음
          newStart = startDate;
          newEnd   = key;
        } else {
          if (key === startDate) return; // 같은 날짜면 무시
          const duration   = new Date(endDate + "T00:00:00") - new Date(startDate + "T00:00:00");
          const newStartMs = new Date(key + "T00:00:00").getTime();
          newStart = key;
          newEnd   = dateKey(new Date(newStartMs + duration));
        }

        _calDropDone = true;
        setTimeout(() => { _calDropDone = false; }, 150);

        try {
          await api("PUT", `/api/events/${id}`, { start_date: newStart, end_date: newEnd });
          const days = Math.round((new Date(newEnd + "T00:00:00") - new Date(newStart + "T00:00:00")) / 86400000) + 1;
          const msg = mode === "resize"
            ? `✓ ${newStart.slice(5).replace("-","/")} ~ ${newEnd.slice(5).replace("-","/")} (${days}일)`
            : `✓ ${newStart.slice(5).replace("-","/")}(으)로 이동됐습니다.`;
          showToast(msg);
          renderCalendar();
        } catch (e) {
          showToast("변경 실패: " + e.message, "error");
        }
      });

      // 날짜 클릭 → 이벤트 등록 팝업
      cell.style.cursor = "pointer";
      cell.addEventListener("click", () => {
        if (_calDropDone) return; // drop 직후 click 무시
        openCalDateModal(key, dayEvents);
      });

      weekEl.appendChild(cell);
    });
    weeksEl.appendChild(weekEl);
  });

  grid.innerHTML = "";
  grid.appendChild(headRow);
  grid.appendChild(weeksEl);
}

function buildEventList(events, start, end) {
  const briefing = $("calBriefing");
  const list = $("calBriefingList");
  const todayStr = dateKey(new Date());
  const realEvents = events.filter((e) => !e.isBirthday)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const birthdays = events.filter((e) => e.isBirthday)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const all = [...birthdays, ...realEvents];

  // 브리핑 타이틀 업데이트
  const titleEl = $("calBriefingTitle");
  if (titleEl) {
    const { year, month } = S.cal;
    if (S.calSearchMemberId) {
      const m = S.members.find((x) => x.id === S.calSearchMemberId);
      titleEl.textContent = `${m?.name || ""} · ${month}월 일정 (${all.length}건)`;
    } else {
      titleEl.textContent = `${month}월 일정 (${all.length}건)`;
    }
  }

  if (all.length === 0) {
    if (briefing) briefing.classList.add("hidden");
    return;
  }
  if (briefing) briefing.classList.remove("hidden");
  list.innerHTML = "";
  all.forEach((e) => {
    const item = document.createElement("div");
    item.className = `event-list-item ${e.type}`;
    const sameDay = e.start_date === e.end_date;
    const dateStr = sameDay ? e.start_date.slice(5).replace("-", "/") :
      `${e.start_date.slice(5).replace("-", "/")} ~ ${e.end_date.slice(5).replace("-", "/")}`;
    const isToday = e.start_date === todayStr && sameDay;
    const bYear = e.type === "birthday" && e.member?.birthday
      ? parseInt(e.member.birthday.slice(0, 4), 10) : null;
    const age = bYear ? new Date(e.start_date).getFullYear() - bYear : null;
    const lunarTag = e.type === "birthday" && (e.isLunar || e.repeat === "yearly_lunar")
      ? `<span style="font-size:10px;color:#7b5ea7;background:#ede7f6;border-radius:4px;padding:1px 5px;margin-left:3px">음</span>` : "";
    item.innerHTML = `
      <div class="event-list-info">
        <div class="event-list-name">
          ${typeIcon(e.type)} ${esc(e.member?.name || "?")}
          <span style="font-size:11px;font-weight:400;color:var(--subtle)">${typeLabel(e.type)}</span>
          ${lunarTag}
          ${age ? `<span style="font-size:11px;color:var(--muted)">만 ${age}세</span>` : ""}
          ${isToday ? `<span style="font-size:11px;background:#f48fb1;color:#fff;border-radius:8px;padding:1px 6px;margin-left:4px">오늘</span>` : ""}
        </div>
        <div class="event-list-date">${dateStr}</div>
        ${e.note && e.note !== "생일" ? `<div class="event-list-note">${esc(e.note)}</div>` : ""}
      </div>
      ${!e.isBirthday && (e.member_id === S.member.id || S.member.role === "admin") ? `<button class="btn-danger" data-id="${e.id}">✕</button>` : ""}
    `;
    list.appendChild(item);
  });

  list.querySelectorAll(".btn-danger[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 일정을 삭제하시겠습니까?")) return;
      try {
        await api("DELETE", `/api/events/${btn.dataset.id}`);
        showToast("일정이 삭제됐습니다.");
        renderCalendar();
      } catch (e) {
        showToast("삭제 실패: " + e.message, "error");
      }
    });
  });
}

function buildEventMemberSelect() {
  const sel = $("popEventMember");
  if (!sel) return;
  sel.innerHTML = "";
  let opts = S.members;
  if (S.member.role !== "admin") opts = S.members.filter((m) => m.id === S.member.id);
  opts.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = `${m.name} (${m.part})`;
    if (m.id === S.member.id) o.selected = true;
    sel.appendChild(o);
  });
}

/* ── Calendar search ──────────────────────────────────────── */
function updateCalSearchUI() {
  const input = $("calSearchInput");
  const clearBtn = $("calSearchClear");
  if (!input) return;
  if (S.calSearchMemberId) {
    const m = S.members.find((x) => x.id === S.calSearchMemberId);
    input.value = m ? m.name : "";
    clearBtn?.classList.remove("hidden");
  } else {
    clearBtn?.classList.add("hidden");
  }
}

function showCalSearchDropdown(query) {
  const dd = $("calSearchDropdown");
  if (!dd) return;
  if (!query.trim()) { dd.classList.add("hidden"); return; }
  const matched = S.members.filter((m) =>
    m.name.includes(query.trim()) || m.part.includes(query.trim())
  );
  if (matched.length === 0) { dd.classList.add("hidden"); return; }
  dd.innerHTML = "";
  matched.slice(0, 8).forEach((m) => {
    const item = document.createElement("div");
    item.className = "cal-search-item";
    item.innerHTML = `<span>${esc(m.name)}</span><span class="cal-search-item-part">${esc(m.part)}</span>`;
    item.addEventListener("click", () => {
      S.calSearchMemberId = m.id;
      dd.classList.add("hidden");
      renderCalendar();
    });
    dd.appendChild(item);
  });
  dd.classList.remove("hidden");
}

async function buildMemberYearView(memberId, year) {
  const panel = $("calYearPanel");
  if (!panel) return;
  panel.classList.remove("hidden");

  const member = S.members.find((m) => m.id === memberId);
  if (!member) return;

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  let events = [];
  try {
    events = await api("GET", `/api/events?start=${startDate}&end=${endDate}`);
  } catch {}

  // 해당 멤버 이벤트만 필터
  events = events.filter((e) => e.member_id === memberId);

  // 생일도 추가 (member.birthday 기반)
  if (member.birthday) {
    const parts = member.birthday.split("-");
    if (parts.length === 3) {
      const bMonth = parts[1];
      const bDay = parts[2];
      const bDate = `${year}-${bMonth}-${bDay}`;
      const alreadyHas = events.find((e) => e.type === "birthday" &&
        e.start_date.slice(5) === `${bMonth}-${bDay}`);
      if (!alreadyHas) {
        events.push({
          id: `bday-${memberId}`,
          member_id: memberId,
          type: "birthday",
          start_date: bDate,
          end_date: bDate,
          note: "생일",
          isBirthday: true,
          member,
        });
      }
    }
  }

  // 월별 그룹
  const byMonth = {};
  events.forEach((e) => {
    const m = parseInt(e.start_date.slice(5, 7), 10);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(e);
  });

  const totalCount = events.length;
  const typeIconMap  = Object.fromEntries(Object.entries(EVENT_TYPES).map(([k,v]) => [k, v.icon]));
  const typeLabelMap = Object.fromEntries(Object.entries(EVENT_TYPES).map(([k,v]) => [k, v.label]));

  let html = `
    <div class="cal-year-panel-title">
      ${esc(member.name)}의 ${year}년 일정
      <span>총 ${totalCount}건</span>
    </div>
    <div class="cal-year-months">
  `;

  if (totalCount === 0) {
    html += `<div class="cal-year-empty">등록된 일정이 없습니다.</div>`;
  } else {
    const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b);
    months.forEach((m) => {
      const mEvents = byMonth[m].sort((a, b) => a.start_date.localeCompare(b.start_date));
      html += `<div class="cal-year-month">
        <div class="cal-year-month-label">${m}월</div>`;
      mEvents.forEach((e) => {
        const sameDay = e.start_date === e.end_date;
        const dateStr = sameDay
          ? `${e.start_date.slice(5).replace("-", "/")}`
          : `${e.start_date.slice(5).replace("-", "/")} ~ ${e.end_date.slice(5).replace("-", "/")}`;
        const icon = typeIconMap[e.type] || "📌";
        const label = typeLabelMap[e.type] || e.type;
        const noteStr = e.note && e.note !== "생일" ? `<span class="cal-year-event-note">${esc(e.note)}</span>` : "";
        html += `<div class="cal-year-event ${e.type}">
          <span class="cal-year-event-date">${dateStr}</span>
          <span class="cal-year-event-label">${icon} ${label}</span>
          ${noteStr}
        </div>`;
      });
      html += `</div>`;
    });
  }
  html += `</div>`;
  panel.innerHTML = html;
}

/* ── Calendar date-click popup ─────────────────────────── */
function openCalDateModal(dateStr, dayEvents) {
  const d = new Date(dateStr + "T00:00:00");
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
  $("calDateModalTitle").textContent =
    `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${weekDays[d.getDay()]})`;

  // 기존 일정 표시
  const evtsEl = $("calDateModalEvents");
  if (!dayEvents || dayEvents.length === 0) {
    evtsEl.innerHTML = `<div class="cal-date-modal-empty">이 날 등록된 일정이 없습니다.</div>`;
  } else {
    evtsEl.innerHTML = dayEvents.map((e) => {
      const name = e.member?.name || "?";
      const icon = typeIcon(e.type);
      const label = typeLabel(e.type);
      const noteStr = e.note && e.note !== "생일" ? ` · ${esc(e.note)}` : "";
      const lunarBadge = e.type === "birthday" && (e.isLunar || e.repeat === "yearly_lunar")
        ? ` <span style="font-size:10px;color:#7b5ea7;background:#ede7f6;border-radius:4px;padding:1px 5px">(음)</span>` : "";
      const canDelete = !e.isBirthday && (e.member_id === S.member.id || S.member.role === "admin");
      const evCalClass = EVENT_TYPES[e.type]?.calClass || e.type;
      return `<div class="cal-date-modal-event ${evCalClass}">
        <span class="cdm-event-text">${icon} <strong>${esc(name)}</strong> ${label}${lunarBadge}${noteStr}</span>
        ${canDelete ? `<button class="cdm-del-btn" data-del-id="${e.id}">✕</button>` : ""}
      </div>`;
    }).join("");
    evtsEl.querySelectorAll("[data-del-id]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        if (!confirm("이 일정을 삭제하시겠습니까?")) return;
        try {
          await api("DELETE", `/api/events/${btn.dataset.delId}`);
          showToast("일정이 삭제됐습니다.");
          closeCalDateModal();
          renderCalendar();
        } catch (err) { showToast("삭제 실패: " + err.message, "error"); }
      });
    });
  }

  // 날짜 기본값
  $("popEventStart").value = dateStr;
  $("popEventEnd").value = dateStr;
  $("popEventNote").value = "";
  const repNone = $("popRepeatNone");
  if (repNone) repNone.checked = true;
  updatePopEventDateHint();

  $("calDateModal").classList.remove("hidden");
}

function closeCalDateModal() {
  $("calDateModal").classList.add("hidden");
}

async function addEventFromPopup() {
  const type = $("popEventType").value;
  const memberId = $("popEventMember").value;
  const start = $("popEventStart").value;
  const end = $("popEventEnd").value || start;
  const note = $("popEventNote").value;
  const repeatVal = document.querySelector('input[name="popEventRepeat"]:checked')?.value || "none";
  const repeat = repeatVal === "none" ? null : repeatVal;
  if (!start) { alert("시작일을 입력하세요."); return; }
  const btn = $("popAddEventBtn");
  btn.disabled = true;
  try {
    await api("POST", "/api/events", {
      type, start_date: start, end_date: end, note, repeat, target_member_id: memberId,
    });
    closeCalDateModal();
    renderCalendar();
    showToast("일정이 등록됐습니다 ✅");
  } catch (e) {
    showToast("등록 실패: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

function updatePopEventDateHint() {
  const isLunar = $("popRepeatLunar")?.checked;
  const hint = $("popEventDateHint");
  if (hint) hint.style.display = isLunar ? "" : "none";
  const si = $("popEventStart");
  if (si) si.title = isLunar ? "음력 날짜를 입력하세요" : "";
}

async function addEvent() {
  // 이제 팝업에서 처리 (addEventFromPopup)
  addEventFromPopup();
}

/* ── Archive ──────────────────────────────────────────── */
function renderArchive() {
  const yearSel = $("archiveYear");
  const isFirst = !yearSel.options.length;
  if (isFirst) {
    const y = new Date().getFullYear();
    for (let i = y; i >= y - 4; i--) {
      const o = document.createElement("option");
      o.value = i;
      o.textContent = `${i}년`;
      yearSel.appendChild(o);
    }
  }
  // 역할별 필터 표시
  // admin(팀장): 파트+팀원 드롭다운 모두 표시
  // leader(파트장): 파트 드롭다운 숨기고 팀원 드롭다운만 표시 (본인 파트 내)
  // member(팀원): 둘 다 숨기고 본인 이름 라벨만
  const isAdmin  = S.member.role === "admin";
  const isLeader = S.member.role === "leader";
  const isMember = !isAdmin && !isLeader;

  $("archivePart").classList.toggle("hidden", !isAdmin);
  $("archiveMember").classList.toggle("hidden", isMember);

  let myLbl = document.getElementById("archiveMyLabel");
  if (isMember || isLeader) {
    if (!myLbl) {
      myLbl = document.createElement("span");
      myLbl.id = "archiveMyLabel";
      myLbl.className = "archive-my-label";
      $("archivePart").parentNode.insertBefore(myLbl, $("archivePart"));
    }
    myLbl.textContent = isMember
      ? `👤 ${S.member.name} (본인 업무만 조회)`
      : `📂 ${S.member.part || "내 파트"} 파트원 조회`;
  } else {
    if (myLbl) myLbl.remove();
  }

  // 파트 목록 (항상 최신 멤버 기준으로 갱신)
  const partSel = $("archivePart");
  partSel.innerHTML = '<option value="">전체 파트</option>';
  const parts = [...new Set(S.members.map((m) => m.part).filter(Boolean))];
  parts.forEach((p) => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    partSel.appendChild(o);
  });

  // 파트 변경 시 멤버 드롭다운 업데이트
  partSel.onchange = updateArchiveMemberList;
  updateArchiveMemberList();

  updateArchiveSelectors();
  // 처음 진입 시 현재 월 기준으로 자동 조회
  if (isFirst) {
    const now = new Date();
    $("archiveView").value = "monthly";
    updateArchiveSelectors();
    $("archiveMonth").value = now.getMonth() + 1;
    doArchiveSearch();
  }
}

function updateArchiveMemberList() {
  const isAdmin  = S.member.role === "admin";
  const isLeader = S.member.role === "leader";
  // 팀장: 드롭다운 선택값 사용 / 파트장: 본인 파트 고정
  const partVal = isAdmin ? $("archivePart").value : (isLeader ? S.member.part : "");
  const memberSel = $("archiveMember");
  const prevVal = memberSel.value;
  memberSel.innerHTML = '<option value="">전체 팀원</option>';
  const filtered = partVal
    ? S.members.filter((m) => m.part === partVal)
    : S.members;
  // 파트별로 그룹화해서 표시
  const byPart = {};
  filtered.forEach((m) => {
    if (!byPart[m.part]) byPart[m.part] = [];
    byPart[m.part].push(m);
  });
  Object.entries(byPart).forEach(([part, members]) => {
    if (!partVal) {
      // 전체 파트일 때 optgroup으로 구분
      const group = document.createElement("optgroup");
      group.label = part;
      members.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name;
        group.appendChild(o);
      });
      memberSel.appendChild(group);
    } else {
      members.forEach((m) => {
        const o = document.createElement("option");
        o.value = m.id;
        o.textContent = m.name;
        memberSel.appendChild(o);
      });
    }
  });
  // 이전 선택값 유지 시도
  if (prevVal && memberSel.querySelector(`option[value="${prevVal}"]`)) {
    memberSel.value = prevVal;
  }
}

function updateArchiveSelectors() {
  const view = $("archiveView").value;
  const isAdmin  = S.member.role === "admin";
  const isMember = !isAdmin && S.member.role !== "leader";
  $("archiveMonth").classList.toggle("hidden", view !== "monthly");
  $("archiveQuarter").classList.toggle("hidden", view !== "quarterly");
  // 파트 드롭다운: 팀장만 + 연간 뷰 아닐 때만
  $("archivePart").classList.toggle("hidden", !isAdmin || view === "yearly");
  // 팀원 드롭다운: 팀원은 항상 숨김, 나머지는 연간 뷰 아닐 때만
  $("archiveMember")?.classList.toggle("hidden", isMember || view === "yearly");
  $("archiveDoneOnly").closest("label")?.classList.remove("hidden"); // 연간 뷰에서도 완료업무 필터 사용 가능
  if (view === "monthly" && !$("archiveMonth").options.length) {
    for (let m = 1; m <= 12; m++) {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = `${m}월`;
      $("archiveMonth").appendChild(o);
    }
    $("archiveMonth").value = new Date().getMonth() + 1;
  }
}

async function doArchiveSearch() {
  const view = $("archiveView").value;
  const year = Number($("archiveYear").value);

  // 역할별 조회 범위
  const isAdmin  = S.member.role === "admin";
  const isLeader = S.member.role === "leader";
  const isMember = !isAdmin && !isLeader;
  // 팀장: 드롭다운 선택 파트 / 파트장: 본인 파트 고정 / 팀원: ""
  const selectedPart = isAdmin ? $("archivePart").value : (isLeader ? (S.member.part || "") : "");
  // 팀원: 본인 ID 고정 / 팀장·파트장: 드롭다운 선택값
  const memberId = isMember ? S.member.id : ($("archiveMember")?.value || "");
  const doneOnly = $("archiveDoneOnly")?.checked || false;
  const result = $("archiveResult");
  result.innerHTML = '<div class="loading">불러오는 중...</div>';

  if (view === "yearly") { await doYearlyArchive(year, result); return; }

  try {
    let url = `/api/reports?year=${year}`;
    if (view === "monthly") url += `&month=${$("archiveMonth").value}`;
    if (view === "quarterly") url += `&quarter=${$("archiveQuarter").value}`;
    if (memberId) url += `&memberId=${encodeURIComponent(memberId)}`;
    else if (selectedPart) url += `&part=${encodeURIComponent(selectedPart)}`;

    const reports = await api("GET", url);
    if (reports.length === 0) {
      result.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>조회 결과가 없습니다.</div>';
      return;
    }

    // Group by week
    const byWeek = {};
    reports.forEach((r) => {
      const key = `${r.year}-${String(r.week).padStart(2, "0")}`;
      if (!byWeek[key]) byWeek[key] = { year: r.year, week: r.week, reports: [] };
      byWeek[key].reports.push(r);
    });

    result.innerHTML = "";
    const sLabel = { waiting: "계획", in_progress: "진행중", done: "완료", hold: "보류" };

    if (view === "weekly") {
      // 주별 뷰: 주차별로 그룹
      Object.keys(byWeek).sort().reverse().forEach((key) => {
        const { year: y, week: w, reports: reps } = byWeek[key];
        const block = document.createElement("div");
        block.className = "archive-week-block";

        const head = document.createElement("div");
        head.className = "archive-week-head";
        head.innerHTML = `
          <span class="archive-week-title">${weekLabel(y, w)}</span>
          <span class="archive-week-meta">총 ${reps.length}명 입력</span>
        `;
        const body = document.createElement("div");
        body.className = "archive-week-body";
        head.addEventListener("click", () => body.classList.toggle("hidden"));

        reps.forEach((r) => {
          const rTasks = getReportTasks(r).filter(i => !doneOnly || (_WEEK_LEGACY[i.status] || i.status) === "done" || (doneOnly && !!i.date) || (i.subtasks || []).some(s => (_WEEK_LEGACY[s.status] || s.status) === "done"));
          if (doneOnly && rTasks.length === 0) return;
          const row = document.createElement("div");
          row.className = "archive-member-row";
          const itemHtml = rTasks.length === 0
            ? '<div style="color:var(--muted);font-size:13px">없음</div>'
            : rTasks.map((i) => {
                const st = _WEEK_LEGACY[i.status] || i.status || "in_progress";
                const dt = i.date ? ` <span class="archive-task-date">(${i.date.slice(5).replace("-","/")})</span>` : "";
                const itemJson = JSON.stringify({
                  memberName: r.member?.name || "?",
                  memberPart: r.member?.part || "",
                  cat1: i.cat1 || "",
                  cat2: i.cat2 || i.category || "",
                  text: i.text || "",
                  status: st,
                  date: i.date || "",
                  reportYear: y,
                  reportWeek: w,
                  subtasks: (i.subtasks || []).filter(s => s.text?.trim()).map(s => ({
                    text: s.text, status: s.status || "in_progress", due_date: s.due_date || "",
                  })),
                }).replace(/"/g, "&quot;");
                return `<div class="archive-item ${st}" data-item="${itemJson}"><span class="archive-item-dot"></span><span class="archive-item-text">[${sLabel[st]}] ${esc(i.text)}${dt}</span></div>`;
              }).join("");
          row.innerHTML = `
            <div class="archive-member-name" data-name="${esc(r.member?.name || "?")}">${esc(r.member?.name || "?")} <span class="archive-member-part">${esc(r.member?.part || "")}</span></div>
            <div class="archive-items">${itemHtml}</div>
            ${r.note ? `<div class="archive-note">📌 ${esc(r.note)}</div>` : ""}
          `;
          body.appendChild(row);
        });
        block.appendChild(head);
        block.appendChild(body);
        result.appendChild(block);
      });
    } else {
      // 월별/분기별 뷰: 멤버별로 집계, 태스크 날짜 기준
      const periodLabel = view === "monthly"
        ? `${year}년 ${$("archiveMonth").value}월 업무 집계`
        : `${year}년 ${$("archiveQuarter").value}분기 업무 집계`;
      const targetYear = year;
      const targetMonth = view === "monthly" ? Number($("archiveMonth").value) : null;
      const targetQ = view === "quarterly" ? Number($("archiveQuarter").value) : null;

      const allReports = reports;
      const memberTaskMap = {}; // memberId → { member, tasks: [...] }

      // 주차 범위 → 날짜 레이블 헬퍼 (단일: "5/26", 범위: "5/19~5/25")
      function weeksRangeLabel(weeks) {
        if (!weeks || weeks.length === 0) return "";
        const sorted = [...weeks].sort((a, b) => a - b);
        const first = sorted[0], last = sorted[sorted.length - 1];
        if (first === last) {
          // 단일 주차: 해당 주의 월요일~일요일 범위
          const ws = weekStart(year, first), we = weekEnd(year, first);
          return `${fmtDate(ws)}~${fmtDate(we)}`;
        }
        // 복수 주차: 첫 주 시작일 ~ 마지막 주 종료일
        const ws = weekStart(year, first), we = weekEnd(year, last);
        return `${fmtDate(ws)}~${fmtDate(we)}`;
      }

      allReports.forEach((r) => {
        const mid = r.member_id;
        if (!memberTaskMap[mid]) memberTaskMap[mid] = { member: r.member, tasks: [] };
        getReportTasks(r).forEach((i) => {
          if (!i.text) return;
          if (i.date) {
            const d = new Date(i.date + "T00:00:00");
            const iMonth = d.getMonth() + 1;
            const iYear = d.getFullYear();
            if (iYear !== targetYear) return;
            if (targetMonth && iMonth !== targetMonth) return;
            if (targetQ && Math.ceil(iMonth / 3) !== targetQ) return;
          }
          // 같은 텍스트 업무가 이미 있으면 주차만 추가 (병합)
          const existing = memberTaskMap[mid].tasks.find((t) => t.text === i.text);
          if (existing) {
            if (!existing.weeks.includes(r.week)) existing.weeks.push(r.week);
            // 상태는 최신 주차(가장 높은 주) 기준으로 갱신
            const latestWeek = Math.max(...existing.weeks);
            if (r.week >= latestWeek) existing.status = i.status || existing.status;
          } else {
            memberTaskMap[mid].tasks.push({ ...i, weeks: [r.week] });
          }
        });
      });

      // Group by part — 파트 필터 / 멤버 필터 우선 적용
      const selectedMemberId = $("archiveMember")?.value || "";
      const PARTS = selectedMemberId
        ? [...new Set(S.members.filter((m) => m.id === selectedMemberId).map((m) => m.part))]
        : selectedPart
          ? [selectedPart]   // 파트 필터가 선택된 경우 해당 파트만
          : [...new Set(S.members.map((m) => m.part).filter(Boolean))];
      const block = document.createElement("div");
      block.className = "archive-week-block";
      const head = document.createElement("div");
      head.className = "archive-week-head";
      head.innerHTML = `<span class="archive-week-title">${periodLabel}</span><span class="archive-week-meta">총 ${Object.values(memberTaskMap).filter(m => m.tasks.length).length}명 데이터</span>`;
      const bodyEl = document.createElement("div");
      bodyEl.className = "archive-week-body";

      PARTS.forEach((part) => {
        const partMembers = S.members.filter((m) => m.part === part && (!part || true));
        const partMembersFiltered = partMembers.filter((m) => memberTaskMap[m.id]?.tasks.length > 0);
        if (partMembersFiltered.length === 0) return;

        const partTitleEl = document.createElement("div");
        partTitleEl.className = "archive-part-title";
        partTitleEl.textContent = part;
        bodyEl.appendChild(partTitleEl);

        partMembersFiltered.forEach((m) => {
          const allTasks = memberTaskMap[m.id].tasks;
          const filteredTasks = doneOnly ? allTasks.filter(i =>
            (_WEEK_LEGACY[i.status] || i.status) === "done" ||
            !!i.date ||
            (i.subtasks || []).some(s => (_WEEK_LEGACY[s.status] || s.status) === "done")
          ) : allTasks;
          if (filteredTasks.length === 0) return;
          const sorted = [...filteredTasks].sort((a, b) => {
            // 첫 번째 주차 기준 정렬
            const wa = Math.min(...(a.weeks || [999]));
            const wb = Math.min(...(b.weeks || [999]));
            return wa - wb || (a.text || "").localeCompare(b.text || "", "ko");
          });
          const row = document.createElement("div");
          row.className = "archive-member-row";
          const tasksHtml = sorted.map((i) => {
            const st = _WEEK_LEGACY[i.status] || i.status || "in_progress";
            const wLabel = weeksRangeLabel(i.weeks);
            // 진행중이면 날짜 숨김 (주간 업무 카드와 동일)
            const dateStr = (i.date && st !== "in_progress") ? i.date.slice(5).replace("-", "/") : "";
            // 날짜: 텍스트 옆에 인라인
            const inlineDtHtml = dateStr
              ? `<span class="archive-task-date">(${dateStr})</span>`
              : "";
            // 주차 범위는 오른쪽에만 (날짜 없을 때)
            const rightDtHtml = !dateStr && wLabel
              ? `<span class="archive-task-weeks">${wLabel}</span>` : "";
            // 진행중이면 배지 숨김
            const showBadge = st !== "in_progress";
            const badgeHtml = showBadge ? `<span class="arc-status-badge ${st}">${sLabel[st]}</span>` : "";
            // cat1 / cat2 헤더
            const cat1Html = i.cat1 ? `<span class="arc-cat1">${esc(i.cat1)}</span>` : "";
            const cat2Html = i.cat2 || i.category ? `<span class="arc-cat2">${esc(i.cat2 || i.category)}</span>` : "";
            const catHtml = (cat1Html || cat2Html)
              ? `<div class="arc-cats">${cat1Html}${cat1Html && cat2Html ? `<span class="arc-cat-sep">›</span>` : ""}${cat2Html}${!i.text || i.text === (i.cat2 || i.category) || i.text === i.cat1 ? inlineDtHtml : ""}</div>`
              : "";
            // subtasks — 기한 표시 추가
            const subs = Array.isArray(i.subtasks) ? i.subtasks.filter(s => s.text?.trim()) : [];
            const subsHtml = subs.length
              ? `<div class="arc-subs">${subs.map(s => {
                  const sSt = _WEEK_LEGACY[s.status] || s.status || "in_progress";
                  const done = s.done || sSt === "done";
                  const sDate = s.due_date ? s.due_date.slice(5).replace("-", "/") : "";
                  const sDateHtml = sDate ? `<span class="arc-sub-date">(${sDate})</span>` : "";
                  return `<div class="arc-sub-row${done ? " done" : ""}"><span class="arc-sub-dot"></span><span class="arc-sub-text">${esc(s.text)}</span>${sDateHtml}</div>`;
                }).join("")}</div>`
              : "";
            const hasMainText = i.text && i.text !== (i.cat2 || i.category) && i.text !== i.cat1;
            const mainText = hasMainText
              ? `<span class="arc-main-text">${esc(i.text)}${inlineDtHtml}</span>` : "";
            const _itemJson = JSON.stringify({
              memberName: m.name || "?",
              memberPart: m.part || "",
              cat1: i.cat1 || "",
              cat2: i.cat2 || i.category || "",
              text: i.text || "",
              status: st,
              date: i.date || "",
              reportYear: targetYear,
              reportWeek: 0,
              subtasks: (i.subtasks || []).filter(s => s.text?.trim()).map(s => ({
                text: s.text, status: s.status || "in_progress", due_date: s.due_date || "",
              })),
            }).replace(/"/g, "&quot;");
            return `<div class="archive-item ${st}" data-date="${esc(dateStr)}" data-item="${_itemJson}">
              <span class="archive-item-dot"></span>
              <div class="arc-item-body">
                ${catHtml}${mainText}${badgeHtml}${rightDtHtml}${subsHtml}
              </div>
            </div>`;
          }).join("");
          const canFeedback = S.member.role === "admin" || S.member.role === "leader";
          const periodVal = view === "monthly" ? Number($("archiveMonth").value) : Number($("archiveQuarter").value);
          row.innerHTML = `
            <div class="archive-member-name" data-name="${esc(m.name)}" style="display:flex;align-items:center;justify-content:space-between">
              <span>${esc(m.name)} <span class="archive-member-part">${esc(m.part)}</span></span>
              ${canFeedback ? `<button class="btn-ghost small archive-feedback-btn" data-mid="${m.id}" data-name="${esc(m.name)}" data-ptype="${view}" data-pval="${periodVal}" data-year="${year}">💬 피드백</button>` : ""}
            </div>
            <div class="archive-items">${tasksHtml}</div>
          `;
          bodyEl.appendChild(row);
        });
      });

      block.appendChild(head);
      block.appendChild(bodyEl);
      result.appendChild(block);
    }
  } catch (e) {
    result.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div>${esc(e.message)}</div>`;
    $("archivePdfBtn")?.classList.add("hidden");
    return;
  }

  // 결과 있으면 PDF 버튼 표시
  const hasCont = result.children.length > 0 && !result.querySelector(".empty-state");
  $("archivePdfBtn")?.classList.toggle("hidden", !hasCont);

  // 피드백 버튼 이벤트
  result.querySelectorAll(".archive-feedback-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = S.members.find((x) => x.id === btn.dataset.mid);
      openFeedbackModal(m, Number(btn.dataset.year), btn.dataset.ptype, Number(btn.dataset.pval));
    });
  });
}

/* ── Archive PDF 내보내기 ──────────────────────────────── */
function exportArchivePdf() {
  const view   = $("archiveView").value;
  const year   = $("archiveYear").value;
  const selectedPart = $("archivePart").value;
  const memberSel = $("archiveMember");
  const memberName = (memberSel?.value && memberSel.selectedOptions[0]?.text !== "전체 팀원")
    ? memberSel.selectedOptions[0].text : null;

  // 기간 레이블
  let periodStr = `${year}년`;
  if (view === "monthly")    periodStr += ` ${$("archiveMonth").value}월`;
  if (view === "quarterly")  periodStr += ` ${$("archiveQuarter").value}분기`;
  const viewLabels = { weekly:"주별", monthly:"월별", quarterly:"분기별", yearly:"연간" };
  const scope = memberName ? memberName : (selectedPart || "전체 파트");

  // 현재 result DOM에서 내용 추출
  const resultEl = $("archiveResult");

  // 상태 컬러 맵
  const statusColor = { in_progress: "#3182f6", done: "#00a661", hold: "#f6a623" };
  const statusLabel = { waiting: "계획", in_progress: "진행중", done: "완료", hold: "보류" };

  // 블록별 HTML 생성
  let bodyHtml = "";
  resultEl.querySelectorAll(".archive-week-block").forEach((block) => {
    const title = block.querySelector(".archive-week-title")?.textContent || "";
    const meta  = block.querySelector(".archive-week-meta")?.textContent || "";

    bodyHtml += `
      <div class="section-head">
        <span class="section-title">${esc(title)}</span>
        <span class="section-meta">${esc(meta)}</span>
      </div>`;

    block.querySelectorAll(".archive-part-title").forEach((pt) => {
      bodyHtml += `<div class="part-label">${esc(pt.textContent)}</div>`;

      let sibling = pt.nextElementSibling;
      while (sibling && !sibling.classList.contains("archive-part-title")) {
        if (sibling.classList.contains("archive-member-row")) {
          const nameEl = sibling.querySelector(".archive-member-name");
          const partSpan = nameEl?.querySelector(".archive-member-part");
          const name = nameEl?.dataset?.name || (nameEl ? (nameEl.firstChild?.textContent || "").trim() : "?") || "?";
          const pname = partSpan?.textContent || "";
          const items = sibling.querySelectorAll(".archive-item");
          const noteEl = sibling.querySelector(".archive-note");

          bodyHtml += `<div class="member-block">
            <div class="member-name">${esc(name)} <span class="member-part">${esc(pname)}</span></div>
            <div class="task-list">`;
          items.forEach((item) => {
            const st = [...item.classList].find(c => statusColor[c]) || "in_progress";
            const itemDate = item.dataset?.date || "";
            const arcBody = item.querySelector(".arc-item-body");
            const text = arcBody ? arcBody.textContent.trim() : (item.querySelector("span:last-child")?.textContent || "");
            const dateLabel = itemDate ? ` <span style="color:#8b95a1;font-size:8.5pt">(${itemDate})</span>` : "";
            const showSt = !(itemDate && st === "in_progress");
            const stLabel = showSt ? ` <span style="color:${statusColor[st]};font-size:8.5pt">[${statusLabel[st]}]</span>` : "";
            bodyHtml += `<div class="task-item">
              <span class="task-dot" style="background:${statusColor[st]}"></span>
              <span class="task-text">${esc(text)}${dateLabel}${stLabel}</span>
            </div>`;
          });
          if (noteEl) bodyHtml += `<div class="task-note">📌 ${esc(noteEl.textContent.replace("📌 ",""))}</div>`;
          bodyHtml += `</div></div>`;
        }
        sibling = sibling.nextElementSibling;
      }
    });

    // 주별 뷰: part-title 없이 바로 member-row (part-title이 있으면 이미 위에서 처리됨)
    if (block.querySelector(".archive-part-title")) return; // 월별/분기별은 위 루프에서 처리
    block.querySelectorAll(":scope > .archive-week-body > .archive-member-row").forEach((row) => {
      const nameEl = row.querySelector(".archive-member-name");
      const partSpan = nameEl?.querySelector(".archive-member-part");
      const name = nameEl?.dataset?.name || (nameEl ? (nameEl.firstChild?.textContent || "").trim() : "?") || "?";
      const pname = partSpan?.textContent || "";
      const items = row.querySelectorAll(".archive-item");
      const noteEl = row.querySelector(".archive-note");

      bodyHtml += `<div class="member-block">
        <div class="member-name">${esc(name)} <span class="member-part">${esc(pname)}</span></div>
        <div class="task-list">`;
      items.forEach((item) => {
        const st = [...item.classList].find(c => statusColor[c]) || "in_progress";
        const itemDate = item.dataset?.date || "";
        const arcBody = item.querySelector(".arc-item-body");
        const text = arcBody ? arcBody.textContent.trim() : (item.querySelector("span:last-child")?.textContent || "");
        const dateLabel = itemDate ? ` <span style="color:#8b95a1;font-size:8.5pt">(${itemDate})</span>` : "";
        const showSt = !(itemDate && st === "in_progress");
        const stLabel = showSt ? ` <span style="color:${statusColor[st]};font-size:8.5pt">[${statusLabel[st]}]</span>` : "";
        bodyHtml += `<div class="task-item">
          <span class="task-dot" style="background:${statusColor[st]}"></span>
          <span class="task-text">${esc(text)}${dateLabel}${stLabel}</span>
        </div>`;
      });
      if (noteEl) bodyHtml += `<div class="task-note">📌 ${esc(noteEl.textContent.replace("📌 ",""))}</div>`;
      bodyHtml += `</div></div>`;
    });
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<title>업무 아카이빙 · ${periodStr} · ${scope}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Noto Sans KR", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    font-size: 10pt; color: #191f28;
    padding: 18mm 16mm;
  }
  .doc-header { margin-bottom: 20px; border-bottom: 2px solid #3182f6; padding-bottom: 12px; }
  .doc-title { font-size: 18pt; font-weight: 700; color: #191f28; }
  .doc-meta { font-size: 9pt; color: #8b95a1; margin-top: 4px; }
  .legend { display: flex; gap: 16px; margin-top: 10px; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 9pt; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
  .section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    background: #f0f5ff; border-left: 4px solid #3182f6;
    padding: 8px 12px; margin: 20px 0 10px;
    border-radius: 0 4px 4px 0;
  }
  .section-title { font-size: 12pt; font-weight: 700; color: #191f28; }
  .section-meta { font-size: 9pt; color: #8b95a1; }
  .part-label {
    font-size: 9pt; font-weight: 700; color: #3182f6;
    background: #e8f0fe; padding: 4px 10px; margin: 12px 0 6px;
    border-radius: 4px; display: inline-block;
  }
  .member-block {
    border: 1px solid #edf0f3; border-radius: 6px;
    padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid;
  }
  .member-name { font-size: 10.5pt; font-weight: 700; margin-bottom: 6px; }
  .member-part { font-size: 8.5pt; font-weight: 400; color: #8b95a1; margin-left: 4px; }
  .task-list { display: flex; flex-direction: column; gap: 4px; }
  .task-item { display: flex; align-items: flex-start; gap: 8px; }
  .task-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .task-text { font-size: 9.5pt; line-height: 1.5; color: #191f28; }
  .task-note { font-size: 8.5pt; color: #8b95a1; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #edf0f3; }
  .footer { margin-top: 30px; font-size: 8pt; color: #c9cdd2; text-align: right; border-top: 1px solid #edf0f3; padding-top: 8px; }
  @page { margin: 15mm; size: A4; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-title">경영지원팀 업무 아카이빙</div>
  <div class="doc-meta">
    ${periodStr} · ${viewLabels[view]} · ${esc(scope)} &nbsp;|&nbsp;
    출력일: ${new Date().toLocaleDateString("ko-KR")} &nbsp;|&nbsp;
    Samsung Medical Center
  </div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#3182f6"></div>진행중</div>
    <div class="legend-item"><div class="legend-dot" style="background:#00a661"></div>완료</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f6a623"></div>보류</div>
  </div>
</div>
${bodyHtml}
<div class="footer">© jiseokchoi &nbsp;·&nbsp; 경영지원팀 스마트 스케줄러</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 800);
}

/* ── Feedback ─────────────────────────────────────────── */
const PERIOD_LABEL = {
  weekly: (v) => `${v}주차`,
  monthly: (v) => `${v}월`,
  quarterly: (v) => `${v}분기`,
  yearly: () => "연간",
};

async function openFeedbackModal(member, year, periodType, periodValue) {
  const modal = $("modal");
  const card = $("modalCard");
  const canWrite = S.member.role === "admin" || S.member.role === "leader";
  const periodStr = PERIOD_LABEL[periodType]?.(periodValue) || "";

  card.innerHTML = `<div class="modal-title">💬 ${esc(member.name)} · ${year}년 ${periodStr} 피드백</div>
    <div id="fbList" style="margin-bottom:16px;display:flex;flex-direction:column;gap:8px;min-height:40px">
      <div style="color:var(--muted);font-size:13px">불러오는 중...</div>
    </div>
    ${canWrite ? `
    <div class="form-field" style="margin-bottom:12px">
      <label>새 피드백 작성</label>
      <textarea id="fbTextarea" rows="3" placeholder="업무 내용에 대한 피드백을 입력하세요."></textarea>
    </div>` : ""}
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">닫기</button>
      ${canWrite ? `<button class="btn-primary" id="submitFbBtn">등록</button>` : ""}
    </div>`;

  modal.classList.remove("hidden");
  card.querySelector("#closeModal").addEventListener("click", closeModal);

  // 피드백 목록 로드
  async function loadFbs() {
    try {
      const list = await api("GET", `/api/feedbacks?target_id=${member.id}&year=${year}&period_type=${periodType}&period_value=${periodValue}`);
      const fbList = card.querySelector("#fbList");
      if (!fbList) return;
      if (list.length === 0) {
        fbList.innerHTML = '<div style="color:var(--muted);font-size:13px">아직 피드백이 없습니다.</div>';
      } else {
        fbList.innerHTML = list.map((f) => `
          <div class="fb-item" data-id="${f.id}">
            <div class="fb-item-head">
              <span class="fb-author">${esc(f.author?.name || "?")}</span>
              <span class="fb-date">${f.created_at?.slice(0, 10) || ""}</span>
              ${(f.author_id === S.member.id || S.member.role === "admin") ? `<button class="btn-danger fb-del-btn" data-id="${f.id}">✕</button>` : ""}
            </div>
            <div class="fb-item-text">${esc(f.text).replace(/\n/g, "<br>")}</div>
          </div>
        `).join("");
        fbList.querySelectorAll(".fb-del-btn").forEach((btn) => {
          btn.addEventListener("click", async () => {
            if (!confirm("피드백을 삭제하시겠습니까?")) return;
            try { await api("DELETE", `/api/feedbacks/${btn.dataset.id}`); await loadFbs(); }
            catch (e) { alert(e.message); }
          });
        });
      }
    } catch { }
  }
  await loadFbs();

  if (canWrite) {
    card.querySelector("#submitFbBtn").addEventListener("click", async () => {
      const text = card.querySelector("#fbTextarea").value.trim();
      if (!text) { alert("피드백 내용을 입력하세요."); return; }
      try {
        await api("POST", "/api/feedbacks", { target_member_id: member.id, year, period_type: periodType, period_value: periodValue, text });
        card.querySelector("#fbTextarea").value = "";
        await loadFbs();
        // 내 업무 피드백 갱신
        if (member.id === S.member.id) renderMyFeedbacks();
      } catch (e) { alert(e.message); }
    });
  }
}

async function doYearlyArchive(year, result) {
  result.innerHTML = '<div class="loading">불러오는 중...</div>';
  const isAdmin  = S.member.role === "admin";
  const isLeader = S.member.role === "leader";
  const isMember = !isAdmin && !isLeader;
  const sLabel = { waiting: "계획", in_progress: "진행중", done: "완료", hold: "보류" };
  const doneOnly = $("archiveDoneOnly")?.checked || false;

  // 가시 멤버 (역할별)
  const visibleMembers = isAdmin
    ? S.members
    : isLeader
      ? S.members.filter((m) => m.part === S.member.part)
      : S.members.filter((m) => m.id === S.member.id);
  const PARTS = [...new Set(visibleMembers.map((m) => m.part).filter(Boolean))];

  function weeksRangeLabel(weeks) {
    if (!weeks || weeks.length === 0) return "";
    const sorted = [...weeks].sort((a, b) => a - b);
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (first === last) {
      const ws = weekStart(year, first), we = weekEnd(year, first);
      return `${fmtDate(ws)}~${fmtDate(we)}`;
    }
    const ws = weekStart(year, first), we = weekEnd(year, last);
    return `${fmtDate(ws)}~${fmtDate(we)}`;
  }

  try {
    let url = `/api/reports?year=${year}`;
    if (isMember) url += `&memberId=${encodeURIComponent(S.member.id)}`;
    else if (isLeader) url += `&part=${encodeURIComponent(S.member.part)}`;
    const reports = await api("GET", url);

    if (reports.length === 0) {
      result.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>조회 결과가 없습니다.</div>';
      return;
    }

    // 월별로 리포트 그룹화
    const byMonth = {};
    reports.forEach((r) => {
      const m = r.month;
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(r);
    });

    result.innerHTML = "";

    for (let month = 1; month <= 12; month++) {
      const monthReports = byMonth[month];
      if (!monthReports || monthReports.length === 0) continue;

      // 멤버별 태스크 집계 (월별 뷰와 동일한 병합 로직)
      const memberTaskMap = {};
      monthReports.forEach((r) => {
        const mid = r.member_id;
        if (!memberTaskMap[mid]) memberTaskMap[mid] = { member: r.member, tasks: [] };
        getReportTasks(r).forEach((i) => {
          if (!i.text) return;
          const existing = memberTaskMap[mid].tasks.find((t) => t.text === i.text);
          if (existing) {
            if (!existing.weeks.includes(r.week)) existing.weeks.push(r.week);
            const latestWeek = Math.max(...existing.weeks);
            if (r.week >= latestWeek) existing.status = i.status || existing.status;
          } else {
            memberTaskMap[mid].tasks.push({ ...i, weeks: [r.week] });
          }
        });
      });

      const hasData = Object.values(memberTaskMap).some((m) => m.tasks.length > 0);
      if (!hasData) continue;

      const block = document.createElement("div");
      block.className = "archive-week-block";
      const head = document.createElement("div");
      head.className = "archive-week-head";
      const dataCount = Object.values(memberTaskMap).filter((m) => m.tasks.length).length;
      head.innerHTML = `
        <span class="archive-week-title">${year}년 ${month}월 업무 집계</span>
        <span class="archive-week-meta">총 ${dataCount}명 데이터</span>
      `;
      const bodyEl = document.createElement("div");
      bodyEl.className = "archive-week-body";
      head.addEventListener("click", () => bodyEl.classList.toggle("hidden"));

      PARTS.forEach((part) => {
        const partMembers = visibleMembers.filter((m) => m.part === part);
        const partMembersFiltered = partMembers.filter(
          (m) => memberTaskMap[m.id]?.tasks.length > 0
        );
        if (partMembersFiltered.length === 0) return;

        const partTitleEl = document.createElement("div");
        partTitleEl.className = "archive-part-title";
        partTitleEl.textContent = part;
        bodyEl.appendChild(partTitleEl);

        partMembersFiltered.forEach((m) => {
          const allTasks = memberTaskMap[m.id].tasks;
          const filteredTasks = doneOnly
            ? allTasks.filter((i) =>
                (_WEEK_LEGACY[i.status] || i.status) === "done" ||
                !!i.date ||
                (i.subtasks || []).some(s => (_WEEK_LEGACY[s.status] || s.status) === "done")
              )
            : allTasks;
          if (filteredTasks.length === 0) return;
          const sorted = [...filteredTasks].sort((a, b) => {
            const wa = Math.min(...(a.weeks || [999]));
            const wb = Math.min(...(b.weeks || [999]));
            return wa - wb || (a.text || "").localeCompare(b.text || "", "ko");
          });

          const row = document.createElement("div");
          row.className = "archive-member-row";
          const tasksHtml = sorted.map((i) => {
            const st = _WEEK_LEGACY[i.status] || i.status || "in_progress";
            const wLabel = weeksRangeLabel(i.weeks);
            // 진행중이면 날짜 숨김
            const dateStr = (i.date && st !== "in_progress") ? i.date.slice(5).replace("-", "/") : "";
            const inlineDtHtml = dateStr ? `<span class="archive-task-date">(${dateStr})</span>` : "";
            const rightDtHtml = !dateStr && wLabel ? `<span class="archive-task-weeks">${wLabel}</span>` : "";
            // 진행중이면 배지 숨김
            const showBadge = st !== "in_progress";
            const badgeHtml = showBadge ? `<span class="arc-status-badge ${st}">${sLabel[st]}</span>` : "";
            const cat1Html = i.cat1 ? `<span class="arc-cat1">${esc(i.cat1)}</span>` : "";
            const cat2Html = i.cat2 || i.category ? `<span class="arc-cat2">${esc(i.cat2 || i.category)}</span>` : "";
            const catHtml = (cat1Html || cat2Html)
              ? `<div class="arc-cats">${cat1Html}${cat1Html && cat2Html ? `<span class="arc-cat-sep">›</span>` : ""}${cat2Html}${!i.text || i.text === (i.cat2 || i.category) || i.text === i.cat1 ? inlineDtHtml : ""}</div>`
              : "";
            // subtasks — 기한 표시 추가
            const subs = Array.isArray(i.subtasks) ? i.subtasks.filter((s) => s.text?.trim()) : [];
            const subsHtml = subs.length
              ? `<div class="arc-subs">${subs.map((s) => {
                  const sSt = _WEEK_LEGACY[s.status] || s.status || "in_progress";
                  const done = s.done || sSt === "done";
                  const sDate = s.due_date ? s.due_date.slice(5).replace("-", "/") : "";
                  const sDateHtml = sDate ? `<span class="arc-sub-date">(${sDate})</span>` : "";
                  return `<div class="arc-sub-row${done ? " done" : ""}"><span class="arc-sub-dot"></span><span class="arc-sub-text">${esc(s.text)}</span>${sDateHtml}</div>`;
                }).join("")}</div>`
              : "";
            const hasMainText = i.text && i.text !== (i.cat2 || i.category) && i.text !== i.cat1;
            const mainText = hasMainText ? `<span class="arc-main-text">${esc(i.text)}${inlineDtHtml}</span>` : "";
            const _itemJson = JSON.stringify({
              memberName: m.name || "?", memberPart: m.part || "",
              cat1: i.cat1 || "", cat2: i.cat2 || i.category || "",
              text: i.text || "", status: st, date: i.date || "",
              reportYear: year, reportWeek: 0,
              subtasks: (i.subtasks || []).filter(s => s.text?.trim()).map(s => ({
                text: s.text, status: s.status || "in_progress", due_date: s.due_date || "",
              })),
            }).replace(/"/g, "&quot;");
            return `<div class="archive-item ${st}" data-date="${esc(dateStr)}" data-item="${_itemJson}">
              <span class="archive-item-dot"></span>
              <div class="arc-item-body">${catHtml}${mainText}${badgeHtml}${rightDtHtml}${subsHtml}</div>
            </div>`;
          }).join("");

          const canFeedback = isPrivileged;
          row.innerHTML = `
            <div class="archive-member-name" data-name="${esc(m.name)}" style="display:flex;align-items:center;justify-content:space-between">
              <span>${esc(m.name)} <span class="archive-member-part">${esc(m.part)}</span></span>
              ${canFeedback ? `<button class="btn-ghost small archive-feedback-btn" data-mid="${m.id}" data-name="${esc(m.name)}" data-ptype="monthly" data-pval="${month}" data-year="${year}">💬 피드백</button>` : ""}
            </div>
            <div class="archive-items">${tasksHtml}</div>
          `;
          bodyEl.appendChild(row);
        });
      });

      block.appendChild(head);
      block.appendChild(bodyEl);
      result.appendChild(block);
    }

    if (result.children.length === 0) {
      result.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div>조회 결과가 없습니다.</div>';
      return;
    }

    // 피드백 버튼 이벤트
    result.querySelectorAll(".archive-feedback-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const m = S.members.find((x) => x.id === btn.dataset.mid);
        openFeedbackModal(m, Number(btn.dataset.year), btn.dataset.ptype, Number(btn.dataset.pval));
      });
    });
  } catch (e) {
    result.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div>${esc(e.message)}</div>`;
  }
}

async function renderMyFeedbacks() {
  const section = $("myFeedbacksSection");
  const list = $("myFeedbacksList");
  if (!section || !list) return;
  try {
    const feedbacks = await api("GET", `/api/feedbacks?target_id=${S.member.id}`);
    if (feedbacks.length === 0) { section.classList.add("hidden"); return; }
    section.classList.remove("hidden");
    feedbacks.sort((a, b) => b.created_at?.localeCompare(a.created_at || "") || 0);
    list.innerHTML = feedbacks.map((f) => {
      const pStr = PERIOD_LABEL[f.period_type]?.(f.period_value) || "";
      return `<div class="fb-item">
        <div class="fb-item-head">
          <span class="fb-author">${esc(f.author?.name || "?")}</span>
          <span class="fb-date">${f.year}년 ${pStr} · ${f.created_at?.slice(0, 10) || ""}</span>
        </div>
        <div class="fb-item-text">${esc(f.text).replace(/\n/g, "<br>")}</div>
      </div>`;
    }).join("");
  } catch { section.classList.add("hidden"); }
}

/* ── Admin ────────────────────────────────────────────── */
/* ── Admin PIN gate ───────────────────────────────────── */
function openAdminTab() {
  // 탭 전환 시마다 인증 초기화 (보안)
  S.adminVerified = false;
  $("adminPinGate").classList.remove("hidden");
  $("adminContent").classList.add("hidden");
  $("adminPinInput").value = "";
  $("adminPinError").textContent = "";
  setTimeout(() => $("adminPinInput").focus(), 80);
}

async function verifyAdminPin() {
  const pin = $("adminPinInput").value.trim();
  const errEl = $("adminPinError");
  const btn = $("adminPinConfirm");
  errEl.textContent = "";
  if (!pin) { errEl.textContent = "PIN을 입력하세요."; return; }
  btn.disabled = true;
  btn.textContent = "확인 중...";
  try {
    await api("POST", "/api/verify-pin", { pin });
    S.adminVerified = true;
    $("adminPinGate").classList.add("hidden");
    $("adminContent").classList.remove("hidden");
    renderAdmin();
  } catch (e) {
    errEl.textContent = "❌ " + e.message;
    $("adminPinInput").value = "";
    $("adminPinInput").focus();
  } finally {
    btn.disabled = false;
    btn.textContent = "확인";
  }
}

/* ── 카테고리 관리 (관리자 전용) ──────────────────────────── */
function renderCategoryAdmin() {
  const wrap = $("catAdminWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  // 자동저장 디바운스
  let _catSaveTimer = null;
  async function autoSaveCategories() {
    const st = document.getElementById("catSaveStatus");
    if (st) { st.textContent = "저장 중..."; st.className = "cat-save-status saving"; }
    try {
      await api("PUT", "/api/categories", PART_CATEGORIES);
      if (st) { st.textContent = "✓ 저장됨"; st.className = "cat-save-status saved"; }
      setTimeout(() => { if (st) { st.textContent = ""; } }, 2500);
    } catch (e) {
      if (st) { st.textContent = `⚠ 저장 실패: ${e.message}`; st.className = "cat-save-status error"; }
    }
  }
  function scheduleSave() {
    if (_catSaveTimer) clearTimeout(_catSaveTimer);
    const st = document.getElementById("catSaveStatus");
    if (st) { st.textContent = "수정 중..."; st.className = "cat-save-status pending"; }
    _catSaveTimer = setTimeout(autoSaveCategories, 400);
  }

  // 상태바
  const statusBar = document.createElement("div");
  statusBar.className = "cat-status-bar";
  statusBar.innerHTML = `
    <span class="cat-status-label">파트별 카테고리① · ② 관리</span>
    <span id="catSaveStatus" class="cat-save-status"></span>
    <button class="btn-primary small" id="catSaveAllBtn">💾 전체 저장</button>
  `;
  wrap.appendChild(statusBar);
  statusBar.querySelector("#catSaveAllBtn").addEventListener("click", autoSaveCategories);

  const parts = Object.keys(PART_CATEGORIES);

  parts.forEach((part) => {
    const card = document.createElement("div");
    card.className = "cat-part-card";
    card.innerHTML = `
      <div class="cat-part-head">
        <span class="cat-part-name">📂 ${esc(part)}</span>
      </div>
      <div class="cat-part-body" id="catBody_${CSS.escape(part)}"></div>
    `;
    wrap.appendChild(card);

    const body = card.querySelector(`#catBody_${CSS.escape(part)}`);

    function rebuildPartUI() {
      body.innerHTML = "";
      const cat1Keys = Object.keys(PART_CATEGORIES[part] || {});

      cat1Keys.forEach((cat1) => {
        const block = document.createElement("div");
        block.className = "cat1-block";
        block.innerHTML = `
          <div class="cat1-head">
            <input class="cat1-name" value="${esc(cat1)}" data-orig="${esc(cat1)}" placeholder="카테고리①" />
            <button class="btn-danger small cat1-del" title="카테고리① 삭제">✕ 삭제</button>
          </div>
          <div class="cat2-list" id="cat2list_${CSS.escape(part)}_${CSS.escape(cat1)}"></div>
          <div class="cat2-add-input-row">
            <input class="cat2-add-input" placeholder="카테고리② 추가 후 Enter" />
            <button class="btn-ghost small btn-cat-add">+ 추가</button>
          </div>
        `;
        body.appendChild(block);

        // cat2 chips
        const cat2ListEl = block.querySelector(".cat2-list");
        function renderCat2Chips() {
          const cur = PART_CATEGORIES[part][cat1] || [];
          cat2ListEl.innerHTML = "";
          cur.forEach((c2, idx) => {
            const chip = document.createElement("div");
            chip.className = "cat2-chip";
            chip.innerHTML = `<input value="${esc(c2)}" /><button class="cat2-del">✕</button>`;
            chip.querySelector("input").addEventListener("change", (e) => {
              const v = e.target.value.trim();
              if (!v) return;
              PART_CATEGORIES[part][cat1][idx] = v;
              scheduleSave();
            });
            chip.querySelector(".cat2-del").addEventListener("click", () => {
              PART_CATEGORIES[part][cat1].splice(idx, 1);
              renderCat2Chips();
              scheduleSave();
            });
            cat2ListEl.appendChild(chip);
          });
        }
        renderCat2Chips();

        // cat2 추가
        const addInput = block.querySelector(".cat2-add-input");
        const addCat2 = () => {
          const v = addInput.value.trim();
          if (!v) return;
          if (!PART_CATEGORIES[part][cat1]) PART_CATEGORIES[part][cat1] = [];
          PART_CATEGORIES[part][cat1].push(v);
          addInput.value = "";
          renderCat2Chips();
          scheduleSave();
        };
        addInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addCat2(); } });
        block.querySelector(".btn-cat-add").addEventListener("click", addCat2);

        // cat1 이름 수정
        block.querySelector(".cat1-name").addEventListener("change", (e) => {
          const orig = e.target.dataset.orig;
          const newName = e.target.value.trim();
          if (!newName || newName === orig) return;
          const entries = Object.entries(PART_CATEGORIES[part]);
          PART_CATEGORIES[part] = {};
          entries.forEach(([k, v]) => { PART_CATEGORIES[part][k === orig ? newName : k] = v; });
          e.target.dataset.orig = newName;
          scheduleSave();
        });

        // cat1 삭제
        block.querySelector(".cat1-del").addEventListener("click", () => {
          if (!confirm(`"${cat1}" 카테고리①을 삭제하시겠습니까?`)) return;
          delete PART_CATEGORIES[part][cat1];
          rebuildPartUI();
          scheduleSave();
        });
      });

      // cat1 추가
      const addRow = document.createElement("div");
      addRow.className = "cat-add-row";
      addRow.innerHTML = `<input placeholder="새 카테고리① 입력" /><button class="btn-ghost small">+ 카테고리① 추가</button>`;
      const addCat1Input = addRow.querySelector("input");
      const addCat1 = () => {
        const v = addCat1Input.value.trim();
        if (!v) return;
        if (!PART_CATEGORIES[part]) PART_CATEGORIES[part] = {};
        if (PART_CATEGORIES[part][v]) { alert("이미 존재하는 카테고리①입니다."); return; }
        PART_CATEGORIES[part][v] = [];
        addCat1Input.value = "";
        rebuildPartUI();
        scheduleSave();
      };
      addCat1Input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addCat1(); } });
      addRow.querySelector("button").addEventListener("click", addCat1);
      body.appendChild(addRow);
    }

    rebuildPartUI();
  });
}

async function renderAdmin() {
  await fetchMembers();
  await fetchCategories();
  renderCategoryAdmin();
  const table = $("memberTable");
  const roleLabel = { admin: "팀장", leader: "파트장", member: "팀원" };

  table.innerHTML = `
    <div class="member-row header">
      <span class="member-col-name">이름</span>
      <span class="member-col-part">파트</span>
      <span class="member-col-role">권한</span>
      <span class="member-col-pin">PIN 상태</span>
      <span class="member-col-action">관리</span>
    </div>
  `;
  S.members.forEach((m) => {
    const pinBadge = m.pin_is_default
      ? `<span class="pin-badge default" title="초기 PIN(0000) 미변경">🔓 초기값</span>`
      : `<span class="pin-badge custom" title="개인 PIN으로 변경됨">🔒 변경됨</span>`;
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <span class="member-col-name member-name">${esc(m.name)}</span>
      <span class="member-col-part">${esc(m.part)}</span>
      <span class="member-col-role"><span class="member-role-badge ${m.role}">${roleLabel[m.role] || m.role}</span></span>
      <span class="member-col-pin">${pinBadge}</span>
      <span class="member-col-action member-actions">
        <button class="btn-ghost small" data-edit="${m.id}">수정</button>
        ${m.id !== "admin" ? `<button class="btn-danger" data-del="${m.id}">삭제</button>` : ""}
      </span>
    `;
    table.appendChild(row);
  });

  table.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openMemberModal(btn.dataset.edit));
  });
  table.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMember(btn.dataset.del));
  });
}

async function deleteMember(id) {
  const m = S.members.find((m) => m.id === id);
  if (!confirm(`${m?.name}을(를) 삭제하시겠습니까?`)) return;
  try {
    await api("DELETE", `/api/members/${id}`);
    renderAdmin();
  } catch (e) {
    alert(e.message);
  }
}

function openMemberModal(id) {
  const member = id ? S.members.find((m) => m.id === id) : null;
  const isNew = !member;
  const modal = $("modal");
  const card = $("modalCard");
  const parts = ["경영지원팀", "경영관리파트", "재무관리파트", "구매파트", "의공파트"];

  const curBdType = member?.birthday_type || "solar";
  card.innerHTML = `
    <div class="modal-title">${isNew ? "팀원 추가" : "팀원 수정"}</div>
    <div class="modal-fields">
      <div class="form-field">
        <label>이름</label>
        <input id="mf-name" type="text" value="${esc(member?.name || "")}" placeholder="이름" />
      </div>
      <div class="form-field">
        <label>파트</label>
        <select id="mf-part">
          ${parts.map((p) => `<option value="${p}" ${member?.part === p ? "selected" : ""}>${p}</option>`).join("")}
        </select>
      </div>
      <div class="field-row">
        <div class="form-field">
          <label>권한</label>
          <select id="mf-role">
            <option value="member"  ${member?.role === "member"  ? "selected" : ""}>팀원</option>
            <option value="leader"  ${member?.role === "leader"  ? "selected" : ""}>파트장</option>
            <option value="admin"   ${member?.role === "admin"   ? "selected" : ""}>팀장</option>
          </select>
        </div>
        <div class="form-field">
          <label>PIN ${isNew ? "(기본: 0000)" : "(변경 시 입력)"}</label>
          <input id="mf-pin" type="password" placeholder="${isNew ? "0000" : "변경 안 함"}" maxlength="8" />
        </div>
      </div>
      <div class="form-field">
        <label>생일 (선택)</label>
        <div class="birthday-field-row">
          <input id="mf-birthday" type="date" value="${member?.birthday || ""}" style="flex:1" />
          <label class="bd-type-label">
            <input type="radio" name="mf-bd-type" value="solar" ${curBdType !== "lunar" ? "checked" : ""} />
            <span>☀️ 양력</span>
          </label>
          <label class="bd-type-label">
            <input type="radio" name="mf-bd-type" value="lunar" ${curBdType === "lunar" ? "checked" : ""} />
            <span>🌙 음력</span>
          </label>
        </div>
        <p id="mf-bd-hint" class="field-hint" style="${curBdType === "lunar" ? "" : "display:none"}">🌙 음력 날짜로 입력하세요 (예: 음력 5월 25일 → 날짜 선택기에서 05월 25일)</p>
      </div>
      <div class="form-field">
        <label>입사일 (선택)</label>
        <input id="mf-joined" type="date" value="${member?.joined || ""}" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">취소</button>
      <button class="btn-primary" id="saveMemberBtn">${isNew ? "추가" : "저장"}</button>
    </div>
  `;
  // 양력/음력 라디오 변경 시 힌트 표시
  card.querySelectorAll('input[name="mf-bd-type"]').forEach((r) => {
    r.addEventListener("change", () => {
      const hint = document.getElementById("mf-bd-hint");
      if (hint) hint.style.display = r.value === "lunar" ? "" : "none";
    });
  });
  modal.classList.remove("hidden");
  $("closeModal").addEventListener("click", closeModal);
  $("saveMemberBtn").addEventListener("click", async () => {
    const name = $("mf-name").value.trim();
    const part = $("mf-part").value;
    const role = $("mf-role").value;
    const pin = $("mf-pin").value.trim();
    const birthday = $("mf-birthday").value;
    const birthday_type = document.querySelector('input[name="mf-bd-type"]:checked')?.value || "solar";
    const joined = $("mf-joined").value;
    if (!name) { alert("이름을 입력하세요."); return; }
    try {
      if (isNew) {
        await api("POST", "/api/members", { name, part, role, pin: pin || "0000", birthday, birthday_type, joined });
      } else {
        const body = { part, role, birthday, birthday_type, joined };
        if (pin) body.pin = pin;
        await api("PUT", `/api/members/${id}`, body);
      }
      closeModal();
      renderAdmin();
    } catch (e) {
      alert(e.message);
    }
  });
}

/* ── Recurring tasks ──────────────────────────────────── */
const WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"]; // 0=Mon

function isWorkday(d) {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  const hols = getHolidays(d.getFullYear());
  return !hols[dateKey(d)];
}

function adjustForHoliday(d, direction) {
  if (!direction || direction === "none") return new Date(d);
  const c = new Date(d);
  if (isWorkday(c)) return c;
  const step = direction === "before" ? -1 : 1;
  let safety = 0;
  while (!isWorkday(c) && safety++ < 14) c.setDate(c.getDate() + step);
  return c;
}

function getRecurringDateForWeek(item, year, week) {
  const s = weekStart(year, week);
  const e = weekEnd(year, week);
  if (item.recurrence_type === "weekly") {
    // recurrence_day: 0=Mon...6=Sun
    const d = new Date(s);
    d.setDate(s.getDate() + item.recurrence_day);
    return adjustForHoliday(d, item.holiday_adjust);
  } else {
    // monthly: check if the target day falls within this week (considering possible adjustment)
    const tryMonth = (yr, mo) => {
      const lastDay = new Date(yr, mo, 0).getDate();
      const day = Math.min(item.recurrence_day, lastDay);
      const raw = new Date(yr, mo - 1, day);
      return adjustForHoliday(raw, item.holiday_adjust);
    };
    const m1 = s.getMonth() + 1, y1 = s.getFullYear();
    const m2 = e.getMonth() + 1, y2 = e.getFullYear();
    const d1 = tryMonth(y1, m1);
    if (d1 >= s && d1 <= e) return d1;
    if (m2 !== m1) {
      const d2 = tryMonth(y2, m2);
      if (d2 >= s && d2 <= e) return d2;
    }
    return null;
  }
}

function recurringDescription(item) {
  if (item.recurrence_type === "weekly") {
    return `매주 ${WEEKDAY_NAMES[item.recurrence_day]}요일`;
  } else {
    return `매월 ${item.recurrence_day}일`;
  }
}

async function fetchRecurring() {
  try {
    S.recurring = await api("GET", "/api/recurring");
  } catch { S.recurring = []; }
}

async function renderRecurring() {
  if (!S.recurring.length) {
    // Fetch if not loaded
    await fetchRecurring();
  }
  const list = $("recurringList");
  if (!list) return;
  list.innerHTML = "";
  if (S.recurring.length === 0) {
    list.innerHTML = '<div class="recurring-empty">반복업무가 없습니다. 추가해보세요!</div>';
    return;
  }
  S.recurring.forEach((item) => {
    const d = getRecurringDateForWeek(item, S.dash.year, S.dash.week);
    const dStr = d ? `${fmtDate(d)} 예정` : "이번 주 해당없음";
    const isThisWeek = !!d;

    const el = document.createElement("div");
    el.className = "recurring-item";
    el.innerHTML = `
      <div style="flex:1;min-width:0">
        <div class="recurring-item-text">${esc(item.text)}</div>
        <div class="recurring-item-desc">${recurringDescription(item)}${item.holiday_adjust !== "none" ? ` · 휴일시 ${item.holiday_adjust === "before" ? "이전" : "다음"} 평일` : ""}</div>
      </div>
      <span class="recurring-item-next${isThisWeek ? " today" : ""}">${dStr}</span>
      <div class="recurring-item-actions">
        ${isThisWeek ? `<button class="btn-ghost small" data-add="${item.id}">+ 추가</button>` : ""}
        <button class="btn-ghost small" data-edit="${item.id}">수정</button>
        <button class="btn-danger" data-del="${item.id}">✕</button>
      </div>
    `;
    list.appendChild(el);
  });

  list.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = S.recurring.find((r) => r.id === btn.dataset.add);
      if (!item) return;
      const d = getRecurringDateForWeek(item, S.dash.year, S.dash.week);
      S.weekTasks.push({ text: item.text, status: "in_progress", date: d ? dateKey(d) : "" });
      renderWeekTasksList();
      btn.textContent = "추가됨 ✓";
      btn.disabled = true;
    });
  });
  list.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openRecurringModal(btn.dataset.edit));
  });
  list.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("반복업무를 삭제하시겠습니까?")) return;
      try {
        await api("DELETE", `/api/recurring/${btn.dataset.del}`);
        S.recurring = S.recurring.filter((r) => r.id !== btn.dataset.del);
        renderRecurring();
      } catch (e) { alert(e.message); }
    });
  });
}

function openRecurringModal(id) {
  const item = id ? S.recurring.find((r) => r.id === id) : null;
  const isNew = !item;
  const modal = $("modal");
  const card = $("modalCard");

  const weekdayOpts = WEEKDAY_NAMES.map((n, i) =>
    `<option value="${i}" ${item?.recurrence_type === "weekly" && item?.recurrence_day === i ? "selected" : ""}>${n}요일</option>`
  ).join("");

  card.innerHTML = `
    <div class="modal-title">${isNew ? "반복업무 추가" : "반복업무 수정"}</div>
    <div class="modal-fields">
      <div class="form-field">
        <label>업무 내용</label>
        <input id="rf-text" type="text" value="${esc(item?.text || "")}" placeholder="예: 주간업무 보고 취합" />
      </div>
      <div class="form-field">
        <label>분류 <span class="field-hint">(선택)</span></label>
        <input id="rf-cat" type="text" value="${esc(item?.category || "")}" placeholder="예: 회계, 예산, 구매" />
      </div>
      <div class="field-row">
        <div class="form-field">
          <label>반복 유형</label>
          <select id="rf-type">
            <option value="weekly" ${item?.recurrence_type !== "monthly" ? "selected" : ""}>매주</option>
            <option value="monthly" ${item?.recurrence_type === "monthly" ? "selected" : ""}>매월</option>
          </select>
        </div>
        <div class="form-field" id="rf-weekly-wrap" ${item?.recurrence_type === "monthly" ? 'style="display:none"' : ""}>
          <label>요일</label>
          <select id="rf-weekday">${weekdayOpts}</select>
        </div>
        <div class="form-field" id="rf-monthly-wrap" ${item?.recurrence_type !== "monthly" ? 'style="display:none"' : ""}>
          <label>날짜 (1~31)</label>
          <input id="rf-mday" type="number" min="1" max="31" value="${item?.recurrence_type === "monthly" ? item.recurrence_day : 1}" />
        </div>
      </div>
      <div class="form-field">
        <label>휴일 조정</label>
        <select id="rf-adjust">
          <option value="after"  ${item?.holiday_adjust !== "before" && item?.holiday_adjust !== "none" ? "selected" : ""}>다음 평일로</option>
          <option value="before" ${item?.holiday_adjust === "before" ? "selected" : ""}>이전 평일로</option>
          <option value="none"   ${item?.holiday_adjust === "none" ? "selected" : ""}>조정 없음</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">취소</button>
      <button class="btn-primary" id="saveRecurringBtn">${isNew ? "추가" : "저장"}</button>
    </div>
  `;
  modal.classList.remove("hidden");

  // Toggle weekly/monthly fields
  $("rf-type").addEventListener("change", () => {
    const t = $("rf-type").value;
    $("rf-weekly-wrap").style.display = t === "weekly" ? "" : "none";
    $("rf-monthly-wrap").style.display = t === "monthly" ? "" : "none";
  });

  $("closeModal").addEventListener("click", closeModal);
  $("saveRecurringBtn").addEventListener("click", async () => {
    const text = $("rf-text").value.trim();
    if (!text) { alert("업무 내용을 입력하세요."); return; }
    const category = $("rf-cat").value.trim();
    const recurrence_type = $("rf-type").value;
    const recurrence_day = recurrence_type === "weekly"
      ? Number($("rf-weekday").value)
      : Number($("rf-mday").value);
    const holiday_adjust = $("rf-adjust").value;
    try {
      if (isNew) {
        await api("POST", "/api/recurring", { text, category, recurrence_type, recurrence_day, holiday_adjust });
      } else {
        await api("PUT", `/api/recurring/${id}`, { text, category, recurrence_type, recurrence_day, holiday_adjust });
      }
      S.recurring = [];            // force refresh
      await fetchRecurring();
      renderRecurring();
      closeModal();
    } catch (e) { alert(e.message); }
  });
}

/* ── My Tasks (personal backlog) ─────────────────────────── */
const TASK_STATUS_LABELS = { waiting: "대기", in_progress: "진행중", done: "완료" };
const TASK_PRIORITY_LABELS = { high: "긴급", normal: "보통", low: "낮음" };

/* ── 파트별 업무 카테고리 (Excel 2026-05-29 기준) ──────────── */
const DEFAULT_PART_CATEGORIES = {
  "재무관리파트": {
    "월 결산":   ["비용 마감", "결산보고서 상신"],
    "연 결산":   ["회계감사", "세무조정", "부서별 입찰현황", "보건산업진흥원 공시"],
    "일반회계":  ["국고보조금", "치과성과급", "월 설정 전표"],
    "세무회계":  ["원천세", "부가세", "재산세", "주민세(사업소분)", "취득세", "종합부동산세", "세법개정검토", "공익법인신고"],
    "자금회계":  ["자금운용실적보고", "6개월 자금 전망", "물품대 지급", "상반기 자금 운용 실적", "연간 자금 운용 실적 및 계획"],
    "개선업무":  ["추가근로소득시스템 구축", "기타소득시스템 구축"],
    "회의체":    ["화요회의", "법인이사회", "부서별 업무보고", "부서별 중점추진과제"],
    "보고서":    [],
    "기타 활동": ["실무형 AI TF", "신규행정인턴교육 TF"],
    "기타 업무": ["교육부감사", "국세 세무조사", "지방세 세무조사", "재고자산 조사", "유형자산 조사", "외부기관 요청 자료"],
  },
  "구매파트": {
    "입찰":      ["예정가 보고", "입찰실시", "구입품의"],
    "구매일반":  [],
    "개선업무":  [],
    "회의체":    ["화요회의", "부서별 업무보고", "부서별 중점추진과제"],
    "보고서":    [],
    "기타 활동": ["QI", "페이퍼리스TF"],
    "기타 업무": ["로봇(AGV) 물류", "외부기관 요청 자료"],
  },
  "경영관리파트": {
    "손익전망":      [],
    "경영계획":      [],
    "주요 지표 관련": [],
    "원가":          ["수익증대 및 원가절감"],
    "개선업무":      [],
    "회의체":        ["주요 주간 업무", "팀장회의", "임원회의", "진료과장회의", "화요회의", "부서별 업무보고", "부서별 중점추진과제"],
    "보고서":        [],
    "기타 활동":     ["업무혁신TF"],
    "기타 업무":     ["외부기관 요청 자료"],
  },
  "의공파트": {
    "예방/수리": [],
    "의공일반":  [],
    "개선업무":  [],
    "회의체":    ["화요회의", "부서별 업무보고", "부서별 중점추진과제"],
    "보고서":    [],
    "기타 활동": ["실무형 AI TF", "QI"],
    "기타 업무": ["외부기관 요청 자료"],
  },
  "경영지원팀": {
    "개선업무":  [],
    "회의체":    ["화요회의", "팀장회의", "부서별 업무보고", "부서별 중점추진과제"],
    "보고서":    [],
    "기타 활동": [],
    "기타 업무": [],
  },
};

// 런타임 카테고리 (서버에서 로드, fallback은 DEFAULT_PART_CATEGORIES)
let PART_CATEGORIES = JSON.parse(JSON.stringify(DEFAULT_PART_CATEGORIES));

async function fetchCategories() {
  try {
    const data = await api("GET", "/api/categories");
    if (data && Object.keys(data).length > 0) {
      PART_CATEGORIES = data;
    }
  } catch (e) { /* 서버 카테고리 없으면 기본값 유지 */ }
}

/**
 * 개인이 입력한 cat1/cat2를 팀 카테고리에 자동 등록
 * - 이미 존재하면 그냥 통과 (중복 방지)
 * - 변경된 경우에만 서버에 PUT 저장
 */
async function autoRegisterCategory(part, cat1, cat2) {
  if (!part || !cat1) return;
  let changed = false;

  if (!PART_CATEGORIES[part]) {
    PART_CATEGORIES[part] = {};
    changed = true;
  }
  if (!PART_CATEGORIES[part][cat1]) {
    PART_CATEGORIES[part][cat1] = [];
    changed = true;
  }
  if (cat2 && !PART_CATEGORIES[part][cat1].includes(cat2)) {
    PART_CATEGORIES[part][cat1].push(cat2);
    changed = true;
  }

  if (changed) {
    try {
      await api("PUT", "/api/categories", PART_CATEGORIES);
    } catch (e) { /* 저장 실패 시 무시 (로컬은 이미 반영됨) */ }
  }
}

/** 현재 사용자(또는 대상 팀원)의 파트별 cat1 키 목록 반환 */
function getPartCat1List(part) {
  return Object.keys(PART_CATEGORIES[part] || {});
}
/** 선택된 cat1에 해당하는 cat2 목록 반환 */
function getPartCat2List(part, cat1) {
  return (PART_CATEGORIES[part] || {})[cat1] || [];
}

/* ── 대상 팀원 선택기 (파트장/팀장 전용) ────────────────────── */
function renderTaskTargetSelector() {
  const row = $("taskTargetRow");
  const sel = $("taskTargetSel");
  if (!row || !sel) return;
  const role = S.member.role;
  if (role === "member") { row.classList.add("hidden"); return; }

  row.classList.remove("hidden");
  sel.innerHTML = "";
  const selfOpt = document.createElement("option");
  selfOpt.value = "";
  selfOpt.textContent = `${S.member.name} (나)`;
  sel.appendChild(selfOpt);

  let targets = [];
  if (role === "admin") {
    targets = S.members.filter((m) => m.id !== S.member.id);
  } else if (role === "leader") {
    targets = S.members.filter((m) => m.id !== S.member.id && m.part === S.member.part);
  }
  targets.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id;
    o.textContent = `${m.name} (${m.part})`;
    sel.appendChild(o);
  });
  sel.value = S.taskTargetMemberId || "";
}

async function fetchTasks() {
  const url = S.taskTargetMemberId
    ? `/api/tasks?target_member_id=${S.taskTargetMemberId}`
    : "/api/tasks";
  try { S.tasks = await api("GET", url); } catch { S.tasks = []; }
}

/* ── 이번 주 해당 여부 판정 (일반 업무) ───────────────────────── */
function isTaskThisWeek(task, year, week) {
  if (!task.due_date) return false;
  const ws = weekStart(year, week);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  return task.due_date >= dateKey(ws) && task.due_date <= dateKey(we);
}

/* ── 공통 업무 카드 빌더 ─────────────────────────────────────── */
function buildTaskCard(task, opts = {}) {
  const { thisWeek = false, num = null } = opts;
  const isDone = task.status === "done";
  const isLinkedRecurring = (S.recurring || []).some((r) => r.text === task.title);

  // ── 한 줄 compact 카드 ──────────────────────────────────────────
  const item = document.createElement("div");
  item.className = "routine-card" + (isDone ? " done-task" : "") + (thisWeek && !isDone ? " this-week-task" : "");

  // 번호
  if (num !== null) {
    const numEl = document.createElement("span");
    numEl.className = "task-num";
    numEl.textContent = `#${num}`;
    item.appendChild(numEl);
  }

  // cat1 › cat2 라벨 + 주기 배지 (왼쪽 그룹)
  const cat1 = task.cat1 || "";
  const cat2 = task.cat2 || task.category || "";
  const label = document.createElement("div");
  label.className = "routine-label";
  if (cat1 || cat2) {
    label.innerHTML =
      (cat1 ? `<span class="rl-cat1">${esc(cat1)}</span>` : "") +
      (cat1 && cat2 ? `<span class="rl-sep"> › </span>` : "") +
      (cat2 ? `<span class="rl-cat2">${esc(cat2)}</span>` : "");
  } else {
    label.innerHTML = `<span class="rl-empty">${esc(task.title || "업무")}</span>`;
  }
  // 주기 배지 — 텍스트 바로 옆에 배치
  if (task.cycle) {
    const cyBadge = document.createElement("span");
    cyBadge.className = "routine-cycle-badge" + (task.cycle === "연중" ? " cycle-yeonjung" : "");
    let cyText = task.cycle
      + (task.cycle === "매년" && task.cycle_month ? ` ${task.cycle_month}월` : "")
      + (task.cycle_day ? ` ${task.cycle_day}일` : "");
    if (task.holiday_adjust === "after")  cyText += " (휴일→다음)";
    if (task.holiday_adjust === "before") cyText += " (휴일→이전)";
    cyBadge.textContent = cyText;
    label.appendChild(cyBadge);
  }
  item.appendChild(label);


  // 액션
  const actions = document.createElement("div");
  actions.className = "mytask-actions";

  if (!isDone) {
    const toWeek = document.createElement("button");
    toWeek.className = "mytask-to-report";
    toWeek.textContent = "→ 이번 주";
    toWeek.addEventListener("click", () => {
      S.weekTasks.push({
        text: task.title, status: "in_progress", date: task.due_date || "",
        cat1: task.cat1 || "", cat2: task.cat2 || task.category || "",
        subtasks: (task.subtasks || []).filter((s) => s.text?.trim()),
      });
      renderWeekTasksList();
      toWeek.textContent = "추가됨 ✓";
      toWeek.disabled = true;
    });
    actions.appendChild(toWeek);
  }

  const editBtn = document.createElement("button");
  editBtn.className = "btn-ghost small";
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => openTaskModal(task.id, { simple: true }));

  const delBtn = document.createElement("button");
  delBtn.className = "btn-danger small";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", async () => {
    if (!confirm(`"${task.title}" 업무를 삭제하시겠습니까?`)) return;
    try {
      await api("DELETE", `/api/tasks/${task.id}`);
      S.tasks = S.tasks.filter((t) => t.id !== task.id);
      renderMyTasks();
    } catch (e) { alert(e.message); }
  });

  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  item.appendChild(actions);
  return item;
}

/* ── 그룹 헤더 빌더 ──────────────────────────────────────────── */
function buildGroupLabel(text, extra = "") {
  const div = document.createElement("div");
  div.className = "mytask-group-label";
  div.innerHTML = `<span>${text}</span>${extra ? `<span class="group-label-count">${extra}</span>` : ""}`;
  return div;
}

/* ── 업무 계층 그룹(대분류 > 중분류) 빌더 ─────────────────────── */
function appendTasksByHierarchy(container, tasks, opts = {}) {
  if (tasks.length === 0) return;
  // counter: 넘버링을 위한 공유 객체. 호출 측에서 { n: 0 }을 넘겨 섹션 간 연속 번호 유지 가능
  const counter = opts.counter || { n: 0 };
  // 파트 순서 기반 cat1 정렬 (PART_CATEGORIES 키 순서 우선)
  const part = (S.taskTargetMemberId
    ? S.members?.find((m) => m.id === S.taskTargetMemberId)?.part
    : S.member?.part) || "";
  const partCat1Order = getPartCat1List(part);
  const byCat1 = {};
  tasks.forEach((task) => {
    const c1 = task.cat1 || "";
    if (!byCat1[c1]) byCat1[c1] = {};
    const c2 = task.cat2 || task.category || "";
    if (!byCat1[c1][c2]) byCat1[c1][c2] = [];
    byCat1[c1][c2].push(task);
  });
  const sortedCat1 = Object.keys(byCat1).sort((a, b) => {
    const ia = partCat1Order.indexOf(a), ib = partCat1Order.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b, "ko");
  });
  sortedCat1.forEach((c1) => {
    const byC2 = byCat1[c1];
    const cat1Wrap = document.createElement("div");
    cat1Wrap.className = "task-cat1-wrap";
    if (c1) {
      const h = document.createElement("div");
      h.className = "task-cat1-header";
      h.textContent = c1;
      cat1Wrap.appendChild(h);
    }
    const cat2Keys = Object.keys(byC2).sort((a, b) => a.localeCompare(b, "ko"));
    cat2Keys.forEach((c2) => {
      if (c2) {
        const h = document.createElement("div");
        h.className = "task-cat2-header";
        h.textContent = c2;
        cat1Wrap.appendChild(h);
      }
      byC2[c2].forEach((task) => {
        counter.n++;
        const thisWeekFlag = opts.markThisWeek
          ? isTaskThisWeek(task, opts.year, opts.week)
          : (opts.thisWeek || false);
        cat1Wrap.appendChild(buildTaskCard(task, { ...opts, showCat: false, num: counter.n, thisWeek: thisWeekFlag }));
      });
    });
    container.appendChild(cat1Wrap);
  });
}

async function renderMyTasks() {
  // 항상 최신 데이터 조회 (로그인 사용자가 바뀌어도 정확한 데이터 보장)
  await fetchTasks();

  // 타인 업무를 보는 경우 반복업무는 본인 것만 (개인 데이터이므로 숨김)
  const isViewingOther = !!S.taskTargetMemberId;
  if (!isViewingOther) await fetchRecurring();
  else S.recurring = [];

  // 대상 팀원 제목 업데이트
  const targetMember = isViewingOther ? S.members.find((m) => m.id === S.taskTargetMemberId) : null;
  const mytasksTitle = document.querySelector(".mytasks-title");
  if (mytasksTitle) {
    mytasksTitle.textContent = targetMember ? `📋 ${targetMember.name}의 루틴 업무 리스트` : "📋 내 루틴 업무 리스트";
  }
  // 반복추가 버튼: 타인 열람 시 숨김 (반복업무는 본인 전용)
  $("addRecurringBtn")?.classList.toggle("hidden", isViewingOther);

  const container = $("myTasksList");
  if (!container) return;

  container.innerHTML = "";

  const { year, week } = S.dash;

  // ── 이번 주 해당 반복업무 / 나머지 반복업무 분리 ──────────────
  const recThisWeek = [];
  const recOther    = [];
  S.recurring.forEach((item) => {
    const d = getRecurringDateForWeek(item, year, week);
    if (d) recThisWeek.push({ item, d });
    else   recOther.push({ item, d: null });
  });

  // ── 일반 업무 분류 ────────────────────────────────────────────
  const activeThisWeek = S.tasks.filter((t) => t.status !== "done" && isTaskThisWeek(t, year, week));
  const activeOther    = S.tasks.filter((t) => t.status !== "done" && !isTaskThisWeek(t, year, week));
  const doneTasks      = S.tasks.filter((t) => t.status === "done");

  // 전체 비어있는 경우 → 기본 업무 세팅 배너 표시
  if (S.recurring.length === 0 && S.tasks.length === 0) {
    const viewPart = (isViewingOther ? targetMember?.part : S.member?.part) || "";
    const hasDefaults = Object.keys(PART_CATEGORIES[viewPart] || {}).length > 0;
    const empty = document.createElement("div");
    empty.className = "mytasks-empty";
    if (hasDefaults && !isViewingOther) {
      empty.innerHTML = `
        <p>등록된 업무가 없습니다.</p>
        <button class="btn-primary" id="initDefaultTasksBtn" style="margin-top:12px">
          📋 파트 기본 업무 세팅
        </button>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">
          <b>${esc(viewPart)}</b> 카테고리 기준으로 기본 업무 목록을 자동 생성합니다.
        </p>`;
      container.appendChild(empty);
      $("initDefaultTasksBtn").addEventListener("click", () => initPartDefaultTasks(viewPart));
    } else {
      empty.textContent = "등록된 업무가 없습니다. 업무를 추가해보세요!";
      container.appendChild(empty);
    }
    return;
  }

  // ── 선택 삭제 툴바 ──────────────────────────────────────────
  let selectMode = false;
  let selectAll  = false;
  const selBar = document.createElement("div");
  selBar.className = "tasks-sel-bar";
  selBar.innerHTML = `
    <button class="btn-ghost small" id="toggleSelectMode">☐ 선택 삭제</button>
    <button class="btn-ghost small" id="toggleSelectAll">전체 선택</button>
    <span class="tasks-sel-count" id="selCount"></span>
    <button class="btn-danger small" id="deleteSelected" style="display:none">선택 삭제</button>
    <button class="btn-danger small" id="deleteAllTasks">전체 삭제</button>
  `;
  container.appendChild(selBar);

  const toggleSelBtn  = selBar.querySelector("#toggleSelectMode");
  const toggleAllBtn  = selBar.querySelector("#toggleSelectAll");
  const selCountEl    = selBar.querySelector("#selCount");
  const delSelBtn     = selBar.querySelector("#deleteSelected");
  const delAllBtn     = selBar.querySelector("#deleteAllTasks");

  function updateSelUI() {
    const checked = container.querySelectorAll(".task-sel-cb:checked");
    const allCbs  = container.querySelectorAll(".task-sel-cb");
    selectAll = allCbs.length > 0 && checked.length === allCbs.length;
    selCountEl.textContent = `${checked.length}건 선택됨`;
    toggleAllBtn.textContent = selectAll ? "전체 해제" : "전체 선택";
    delSelBtn.style.display = (selectMode && checked.length > 0) ? "" : "none";
    // selBar 자체에 클래스로 선택모드 상태 관리 (CSS로 show/hide)
    selBar.classList.toggle("sel-active", selectMode);
    container.classList.toggle("tasks-select-mode", selectMode);
    toggleSelBtn.textContent = selectMode ? "✕ 취소" : "☐ 선택 삭제";
    toggleSelBtn.classList.toggle("active", selectMode);
  }

  toggleSelBtn.addEventListener("click", () => {
    selectMode = !selectMode;
    if (!selectMode) {
      container.querySelectorAll(".task-sel-cb").forEach((cb) => (cb.checked = false));
    }
    updateSelUI();
  });

  toggleAllBtn.addEventListener("click", () => {
    const allCbs = container.querySelectorAll(".task-sel-cb");
    const nowAll = [...allCbs].every((cb) => cb.checked);
    allCbs.forEach((cb) => (cb.checked = !nowAll));
    updateSelUI();
  });

  delSelBtn.addEventListener("click", async () => {
    const checked = [...container.querySelectorAll(".task-sel-cb:checked")];
    if (!checked.length) return;
    if (!confirm(`선택한 업무 ${checked.length}건을 삭제하시겠습니까?`)) return;
    const ids = checked.map((cb) => cb.dataset.id);
    for (const id of ids) {
      try { await api("DELETE", `/api/tasks/${id}`); } catch {}
    }
    S.tasks = S.tasks.filter((t) => !ids.includes(t.id));
    renderMyTasks();
  });

  delAllBtn.addEventListener("click", async () => {
    const allIds = S.tasks.filter((t) => t.status !== "done").map((t) => t.id);
    if (!allIds.length) return;
    if (!confirm(`루틴 업무 전체 ${allIds.length}건을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    for (const id of allIds) {
      try { await api("DELETE", `/api/tasks/${id}`); } catch {}
    }
    S.tasks = S.tasks.filter((t) => !allIds.includes(t.id));
    renderMyTasks();
  });

  // ── 루틴 업무 flat 리스트 (cat1 → cat2 → title 순) ──────────
  const activeTasks = S.tasks.filter((t) => t.status !== "done");
  const cat1Order = getPartCat1List(S.member?.part || "");
  activeTasks.sort((a, b) => {
    const i1a = cat1Order.indexOf(a.cat1 || ""), i1b = cat1Order.indexOf(b.cat1 || "");
    if (i1a !== i1b) { if (i1a < 0) return 1; if (i1b < 0) return -1; return i1a - i1b; }
    const c2d = (a.cat2 || a.category || "").localeCompare(b.cat2 || b.category || "", "ko");
    if (c2d) return c2d;
    return (a.title || "").localeCompare(b.title || "", "ko");
  });
  activeTasks.forEach((task, i) => {
    const tw = isTaskThisWeek(task, year, week);
    const card = buildTaskCard(task, { num: i + 1, thisWeek: tw });
    // 선택용 체크박스 (select mode 시만 보임)
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "task-sel-cb";
    cb.dataset.id = task.id;
    cb.addEventListener("change", updateSelUI);
    card.prepend(cb);
    container.appendChild(card);
  });

  // ── 완료된 업무 (접기/펼치기) ──────────────────────────────────
  if (doneTasks.length > 0) {
    const details = document.createElement("details");
    details.className = "done-tasks-details";
    const summary = document.createElement("summary");
    summary.className = "done-tasks-summary mytask-group-label";
    summary.innerHTML = `<span>✅ 완료된 업무</span><span class="group-label-count">${doneTasks.length}건</span>`;
    details.appendChild(summary);
    const inner = document.createElement("div");
    doneTasks.forEach((task, i) => {
      inner.appendChild(buildTaskCard(task, { num: i + 1, thisWeek: false }));
    });
    details.appendChild(inner);
    container.appendChild(details);
  }

  // 루틴 마감 알림 배너 갱신 (tasks 로드 후 재계산)
  const { year: dy, week: dw } = S.dash;
  renderRoutineDueBanner(dy, dw);
}

/* ── 업무 정렬 (카테고리① → ② → 제목 내림차순) ─────────────── */
function sortMyTasks() {
  const part = (S.taskTargetMemberId
    ? S.members?.find((m) => m.id === S.taskTargetMemberId)?.part
    : S.member?.part) || "";
  const cat1Order = getPartCat1List(part);
  S.tasks.sort((a, b) => {
    const c1a = a.cat1 || "", c1b = b.cat1 || "";
    const i1a = cat1Order.indexOf(c1a), i1b = cat1Order.indexOf(c1b);
    if (i1a !== i1b) {
      if (i1a === -1) return 1;
      if (i1b === -1) return -1;
      return i1b - i1a; // 내림차순
    }
    const c2a = a.cat2 || a.category || "", c2b = b.cat2 || b.category || "";
    if (c2a !== c2b) return c2b.localeCompare(c2a, "ko"); // 내림차순
    return (b.title || "").localeCompare(a.title || "", "ko"); // 내림차순
  });
  renderMyTasks();
}

/* 반복업무 단일 아이템 빌더 (renderMyTasks 내부 공용) */
function buildRecurringItem(item, d, isThisWeek, num = null) {
  const el = document.createElement("div");
  el.className = "mytask-item mytask-recurring" + (isThisWeek ? " this-week-task" : "");
  if (num !== null) {
    const numEl = document.createElement("div");
    numEl.className = "task-num";
    numEl.textContent = `#${num}`;
    el.appendChild(numEl);
  }
  const iconEl = document.createElement("div");
  iconEl.className = "mytask-recurring-icon";
  iconEl.textContent = "🔁";
  const body = document.createElement("div");
  body.className = "mytask-body";
  body.innerHTML = `
    <div class="mytask-title">${esc(item.text)}</div>
    <div class="mytask-meta">
      <span class="mytask-badge recurring-badge">${recurringDescription(item)}</span>
      ${isThisWeek && d ? `<span class="mytask-badge thisweek-date">${fmtDate(d)} 예정</span>` : `<span class="mytask-badge" style="color:var(--muted)">이번 주 해당없음</span>`}
    </div>`;
  const actions = document.createElement("div");
  actions.className = "mytask-actions";
  if (isThisWeek && d) {
    const toWeek = document.createElement("button");
    toWeek.className = "mytask-to-report";
    toWeek.textContent = "→ 이번 주";
    toWeek.addEventListener("click", () => {
      S.weekTasks.push({ text: item.text, status: "in_progress", date: dateKey(d) });
      renderWeekTasksList();
      toWeek.textContent = "추가됨 ✓";
      toWeek.disabled = true;
    });
    actions.appendChild(toWeek);
  }
  const editBtn = document.createElement("button");
  editBtn.className = "btn-ghost small";
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => openRecurringModal(item.id));
  actions.appendChild(editBtn);
  const delBtn = document.createElement("button");
  delBtn.className = "btn-danger";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", async () => {
    if (!confirm("반복업무를 삭제하시겠습니까?")) return;
    try {
      await api("DELETE", `/api/recurring/${item.id}`);
      S.recurring = S.recurring.filter((r) => r.id !== item.id);
      renderMyTasks();
    } catch (e) { alert(e.message); }
  });
  actions.appendChild(delBtn);
  el.appendChild(iconEl);
  el.appendChild(body);
  el.appendChild(actions);
  return el;
}

function openTaskModal(id, modalOpts = {}) {
  const { addToWeek = false, simple = false } = modalOpts;
  const task   = id ? S.tasks.find((t) => t.id === id) : null;
  const isNew  = !task;
  const targetMember = S.taskTargetMemberId ? S.members.find((m) => m.id === S.taskTargetMemberId) : null;
  const viewMember   = targetMember || S.member;
  const part   = viewMember?.part || "";
  const modal  = $("modal");
  const card   = $("modalCard");

  // 세부업무 로컬 상태 (status + due_date 포함)
  let subtasks = (task?.subtasks || []).map((s) => ({
    id: s.id || genLocalId(),
    text: s.text || "",
    done: !!s.done,
    status:   s.status   || "in_progress",
    due_date: s.due_date || "",
  }));

  // 파트별 cat1 목록
  const cat1Keys = getPartCat1List(part);

  // cat2 → cat1 역방향 조회 맵 (파트 내 모든 cat2의 소속 cat1)
  const cat2ToCat1 = {};
  cat1Keys.forEach((c1) => {
    getPartCat2List(part, c1).forEach((c2) => { cat2ToCat1[c2] = c1; });
  });

  // cat1 select HTML
  function buildCat1Options(selected) {
    let html = `<option value="">선택안함</option>`;
    cat1Keys.forEach((k) => {
      html += `<option value="${esc(k)}" ${selected === k ? "selected" : ""}>${esc(k)}</option>`;
    });
    if (selected && !cat1Keys.includes(selected)) {
      html += `<option value="${esc(selected)}" selected>${esc(selected)}</option>`;
    }
    html += `<option value="__custom__">직접 입력…</option>`;
    return html;
  }

  /**
   * cat2 select HTML — optgroup 방식
   * cat1Val = "" → 파트 전체 cat2를 cat1별 그룹으로 표시
   * cat1Val = X  → 해당 cat1의 cat2만 표시 (flat)
   */
  function buildCat2Options(cat1Val, selected) {
    let html = `<option value="">선택안함</option>`;
    if (cat1Val && cat1Val !== "__custom__") {
      // cat1 선택됨 → 해당 cat2만 flat 표시
      const list = getPartCat2List(part, cat1Val);
      list.forEach((k) => {
        html += `<option value="${esc(k)}" ${selected === k ? "selected" : ""}>${esc(k)}</option>`;
      });
      if (selected && !list.includes(selected) && selected !== "__custom__") {
        html += `<option value="${esc(selected)}" selected>${esc(selected)}</option>`;
      }
    } else {
      // cat1 미선택 → 파트 전체를 optgroup으로 표시
      cat1Keys.forEach((c1) => {
        const list = getPartCat2List(part, c1);
        if (!list.length) return;
        html += `<optgroup label="${esc(c1)}">`;
        list.forEach((k) => {
          html += `<option value="${esc(k)}" ${selected === k ? "selected" : ""}>${esc(k)}</option>`;
        });
        html += `</optgroup>`;
      });
      // 기존 값이 목록에 없으면 따로 추가
      const allCat2 = Object.values(PART_CATEGORIES[part] || {}).flat();
      if (selected && !allCat2.includes(selected) && selected !== "__custom__") {
        html += `<option value="${esc(selected)}" selected>${esc(selected)}</option>`;
      }
    }
    html += `<option value="__custom__">직접 입력…</option>`;
    return html;
  }

  const initCat1 = task?.cat1     || "";
  const initCat2 = task?.cat2 || task?.category || "";

  const weekdayOptsHtml = WEEKDAY_NAMES.map((n, i) => `<option value="${i}">${n}요일</option>`).join("");
  const modalTitle = isNew ? (targetMember ? `${esc(targetMember.name)}의 업무 추가` : "업무 추가") : "업무 수정";

  card.innerHTML = `
    <div class="modal-title">${modalTitle}</div>
    <div class="modal-fields">

      <div class="field-row">
        <div class="form-field">
          <label>카테고리 ①</label>
          <select id="tf-cat1">${buildCat1Options(initCat1)}</select>
          <input id="tf-cat1-custom" type="text" class="hidden"
            value="${initCat1 && !cat1Keys.includes(initCat1) ? esc(initCat1) : ""}"
            placeholder="직접 입력" style="margin-top:6px" />
        </div>
        <div class="form-field">
          <label>카테고리 ②</label>
          <select id="tf-cat2">${buildCat2Options(initCat1, initCat2)}</select>
          <input id="tf-cat2-custom" type="text" class="hidden"
            value="${initCat2 && !Object.values(PART_CATEGORIES[part]||{}).flat().includes(initCat2) ? esc(initCat2) : ""}"
            placeholder="직접 입력" style="margin-top:6px" />
        </div>
      </div>

      <div class="form-field tf-status-row">
        <label>상태</label>
        <div class="tf-status-btns">
          <button type="button" class="tf-st-btn${(task?.status||'in_progress')==='waiting'     ?' active':''}" data-key="waiting">계획</button>
          <button type="button" class="tf-st-btn${(task?.status||'in_progress')==='in_progress' ?' active':''}" data-key="in_progress">진행</button>
          <button type="button" class="tf-st-btn${(task?.status||'in_progress')==='done'        ?' active':''}" data-key="done">완료</button>
        </div>
      </div>
      <div class="form-field" id="tf-date-wrap" style="${(task?.status||'in_progress')==='in_progress'?'display:none':''}">
        <label>일자 <span class="field-hint">(선택)</span></label>
        <input type="date" id="tf-date" value="${task?.due_date || ''}" />
      </div>

      ${!simple ? `
      <div class="form-field">
        <label>세부 업무 <span class="field-hint">(선택) 항목별 마감일·상태 설정 가능</span></label>
        <div id="mst-list" class="mst-list mst-list-v2"></div>
        <div class="mst-add-row">
          <input id="mst-input" type="text" placeholder="세부 업무 입력 후 Enter 또는 + 추가" />
          <button id="mst-add-btn" class="btn-ghost small" type="button">+ 추가</button>
        </div>
      </div>

      <div class="form-field">
        <label>메모 <span class="field-hint">(선택)</span></label>
        <textarea id="tf-note" rows="2" placeholder="추가 내용, 참고사항 등">${esc(task?.note || "")}</textarea>
      </div>` : ""}

    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">취소</button>
      <button class="btn-primary" id="saveTaskBtn">${isNew ? "추가" : "저장"}</button>
    </div>
  `;
  modal.classList.remove("hidden");

  /* ── 세부업무 렌더링 (상태 + 마감일 포함) ─────────── */
  function renderMstList() {
    const list = $("mst-list");
    if (!subtasks.length) {
      list.innerHTML = '<div class="mst-empty">세부 업무를 추가하세요.</div>';
      return;
    }
    list.innerHTML = "";
    subtasks.forEach((s, i) => {
      const curSt = s.status || "in_progress";
      const row = document.createElement("div");
      row.className = "mst-item-v2" + (curSt === "done" ? " mst-done" : "");

      // 텍스트 행
      const topDiv = document.createElement("div");
      topDiv.className = "mst-v2-top";

      const inp = document.createElement("input");
      inp.type = "text"; inp.className = "mst-text-input";
      inp.value = s.text; inp.placeholder = "세부 업무 내용";
      inp.addEventListener("input", (e) => { subtasks[i].text = e.target.value; });

      const delBtn = document.createElement("button");
      delBtn.className = "mst-del"; delBtn.type = "button"; delBtn.title = "삭제"; delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => { subtasks.splice(i, 1); renderMstList(); });

      topDiv.appendChild(inp);
      topDiv.appendChild(delBtn);

      // 상태 버튼 + 날짜 행
      const metaDiv = document.createElement("div");
      metaDiv.className = "mst-v2-meta";

      const stBtns = document.createElement("div");
      stBtns.className = "mst-st-btns";
      [["waiting", "계획"], ["in_progress", "진행중"], ["done", "완료"]].forEach(([key, label]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tf-st-btn mst-st-btn" + (curSt === key ? " active" : "");
        btn.dataset.key = key;
        btn.textContent = label;
        btn.addEventListener("click", () => {
          subtasks[i].status = key;
          subtasks[i].done   = key === "done";
          row.classList.toggle("mst-done", key === "done");
          stBtns.querySelectorAll(".mst-st-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          // 진행중이면 날짜 숨김
          dateWrap.style.display = key === "in_progress" ? "none" : "";
        });
        stBtns.appendChild(btn);
      });

      const dateWrap = document.createElement("div");
      dateWrap.className = "mst-date-wrap";
      dateWrap.style.display = curSt === "in_progress" ? "none" : "";

      const dateIn = document.createElement("input");
      dateIn.type = "date"; dateIn.className = "mst-date-input";
      dateIn.value = s.due_date || ""; dateIn.title = "마감일";
      dateIn.addEventListener("change", (e) => { subtasks[i].due_date = e.target.value; });

      dateWrap.appendChild(dateIn);
      metaDiv.appendChild(stBtns);
      metaDiv.appendChild(dateWrap);

      row.appendChild(topDiv);
      row.appendChild(metaDiv);
      list.appendChild(row);
    });
  }

  function addSubtask() {
    const input = $("mst-input");
    const text  = input.value.trim();
    if (!text) return;
    subtasks.push({ id: genLocalId(), text, done: false, status: "in_progress", due_date: "" });
    input.value = "";
    renderMstList();
    // 새로 추가된 항목의 text-input에 포커스
    const items = $("mst-list").querySelectorAll(".mst-text-input");
    if (items.length) items[items.length - 1].focus();
  }

  if (!simple) {
    renderMstList();
    $("mst-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addSubtask(); } });
    $("mst-add-btn").addEventListener("click", addSubtask);
  }

  /* ── cat1 ↔ cat2 연동 ────────────────────────────── */
  const cat1Sel    = $("tf-cat1");
  const cat1Custom = $("tf-cat1-custom");
  const cat2Sel    = $("tf-cat2");
  const cat2Custom = $("tf-cat2-custom");

  // cat1 초기 상태 (기존 값이 목록에 없으면 custom 표시)
  if (initCat1 && !cat1Keys.includes(initCat1)) {
    cat1Sel.value = "__custom__";
    cat1Custom.classList.remove("hidden");
  }
  const allCat2Flat = Object.values(PART_CATEGORIES[part] || {}).flat();
  if (initCat2 && !allCat2Flat.includes(initCat2)) {
    cat2Sel.value = "__custom__";
    cat2Custom.classList.remove("hidden");
  }

  // cat1 변경 → cat2 필터링
  cat1Sel.addEventListener("change", () => {
    const v = cat1Sel.value;
    cat1Custom.classList.toggle("hidden", v !== "__custom__");
    const cat1Val = v === "__custom__" ? cat1Custom.value.trim() : v;
    // cat2 재구성 (선택된 cat1 기준 또는 전체 optgroup)
    cat2Sel.innerHTML = buildCat2Options(cat1Val, "");
    cat2Custom.classList.add("hidden");
    cat2Custom.value = "";
  });
  cat1Custom.addEventListener("input", () => {
    cat2Sel.innerHTML = buildCat2Options(cat1Custom.value.trim(), "");
  });

  // cat2 선택 → cat1 자동 설정 (역방향 조회)
  cat2Sel.addEventListener("change", () => {
    const v = cat2Sel.value;
    cat2Custom.classList.toggle("hidden", v !== "__custom__");
    if (v && v !== "__custom__") {
      const inferredCat1 = cat2ToCat1[v];
      if (inferredCat1 && cat1Sel.value !== inferredCat1) {
        cat1Sel.value = inferredCat1;
        cat1Custom.classList.add("hidden");
        cat2Sel.innerHTML = buildCat2Options(inferredCat1, v);
      }
    }
  });

  /* ── 상태 버튼 토글 + 일자 표시 제어 ──────────────── */
  card.querySelectorAll(".tf-st-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".tf-st-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      // 진행 상태이면 일자 숨김
      const dateWrap = $("tf-date-wrap");
      if (dateWrap) dateWrap.style.display = btn.dataset.key === "in_progress" ? "none" : "";
    });
  });

  /* ── 저장 ────────────────────────────────────────── */
  $("closeModal").addEventListener("click", closeModal);
  $("tf-cat1").focus();

  $("saveTaskBtn").addEventListener("click", async () => {
    const cat1Val = cat1Sel.value === "__custom__"
      ? cat1Custom.value.trim()
      : cat1Sel.value;
    const cat2Val = cat2Sel.value === "__custom__"
      ? cat2Custom.value.trim()
      : cat2Sel.value;
    // 업무명: 카테고리② → 카테고리① → 직접입력 순으로 자동 파생
    const title = cat2Val || cat1Val;
    if (!title) { alert("카테고리①을 선택하거나 직접 입력하세요."); return; }

    // 상태: 직접 선택한 값 우선, 세부업무 있으면 재집계
    let taskStatus = card.querySelector(".tf-st-btn.active")?.dataset.key || "in_progress";
    const taskDate = $("tf-date")?.value || null;

    let validSubs = [];
    if (!simple) {
      // 세부업무 text 필드 동기화
      $("mst-list").querySelectorAll(".mst-text-input").forEach((inp) => {
        const idx = +inp.dataset.idx;
        if (subtasks[idx]) subtasks[idx].text = inp.value;
      });
      validSubs = subtasks.filter((s) => s.text.trim());
      // 세부업무 있으면 전체 상태 자동 집계
      if (validSubs.length > 0) {
        if (validSubs.every((s) => s.status === "done")) taskStatus = "done";
        else if (validSubs.every((s) => s.status === "waiting")) taskStatus = "waiting";
        else taskStatus = "in_progress";
      }
    }

    const body = {
      title,
      cat1:     cat1Val,
      category: cat2Val,
      status:   taskStatus,
      due_date: taskDate,
      note:     simple ? "" : ($("tf-note")?.value.trim() || ""),
      subtasks: validSubs,
    };
    try {
      if (isNew) {
        const createBody = S.taskTargetMemberId ? { ...body, target_member_id: S.taskTargetMemberId } : body;
        const res = await api("POST", "/api/tasks", createBody);
        S.tasks.unshift(res.task);
        // 이번 주 업무현황에도 추가 (직접 입력 경로)
        if (addToWeek) {
          S.weekTasks.push({
            text: title, cat1: cat1Val, cat2: cat2Val,
            status: taskStatus, date: taskDate || "",
            subtasks: validSubs,
          });
          renderWeekTasksList();
        }
      } else {
        await api("PUT", `/api/tasks/${id}`, body);
        const idx = S.tasks.findIndex((t) => t.id === id);
        if (idx >= 0) S.tasks[idx] = { ...S.tasks[idx], ...body };
      }

      // ── 신규 cat1 / cat2 자동으로 팀 카테고리에 등록 ──
      await autoRegisterCategory(part, cat1Val, cat2Val);

      closeModal();
      renderMyTasks();
    } catch (e) { alert(e.message); }
  });
}

// 불러오기 모달 — 백로그에서 이번 주 업무에 일괄 추가
function openTaskImportModal() {
  const active = S.tasks.filter((t) => t.status !== "done");
  const modal = $("modal");
  const card = $("modalCard");

  if (active.length === 0) {
    alert("불러올 수 있는 진행 중 업무가 없습니다.\n먼저 업무 목록에 업무를 추가해주세요.");
    return;
  }

  const itemsHtml = active.map((t) => `
    <label class="import-task-item" data-id="${t.id}">
      <input type="checkbox" value="${t.id}" />
      <div>
        <div class="import-task-text">${esc(t.title)}</div>
        <div class="import-task-sub">${[
          TASK_STATUS_LABELS[t.status],
          t.category,
          t.due_date ? `마감 ${t.due_date.slice(5).replace("-","/")}` : ""
        ].filter(Boolean).join(" · ")}</div>
      </div>
    </label>
  `).join("");

  card.innerHTML = `
    <div class="modal-title">📋 이번 주 업무에 불러오기</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">추가할 업무를 선택하세요.</p>
    <div class="import-task-list">${itemsHtml}</div>
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">취소</button>
      <button class="btn-primary" id="confirmImport">이번 주에 추가</button>
    </div>
  `;

  card.querySelectorAll(".import-task-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      const cb = el.querySelector("input[type=checkbox]");
      cb.checked = !cb.checked;
      el.classList.toggle("selected", cb.checked);
    });
    el.querySelector("input").addEventListener("change", (e) => {
      el.classList.toggle("selected", e.target.checked);
    });
  });

  modal.classList.remove("hidden");
  $("closeModal").addEventListener("click", closeModal);
  $("confirmImport").addEventListener("click", () => {
    const checked = [...card.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
    if (checked.length === 0) { alert("업무를 선택하세요."); return; }
    checked.forEach((tid) => {
      const t = S.tasks.find((t) => t.id === tid);
      if (!t) return;
      S.weekTasks.push({
        text: t.title,
        status: t.status === "done" ? "done" : "in_progress",
        date: t.due_date || "",
        cat1: t.cat1 || "", cat2: t.cat2 || t.category || "",
        subtasks: (t.subtasks || []).filter((s) => s.text?.trim()),
      });
    });
    renderWeekTasksList();
    closeModal();
  });
}

/* ── 파트 기본 업무 초기화 ───────────────────────────────── */
async function initPartDefaultTasks(part) {
  const catMap = PART_CATEGORIES[part];
  if (!catMap) return;
  const pairs = [];
  Object.entries(catMap).forEach(([cat1, cat2List]) => {
    if (cat2List.length > 0) {
      cat2List.forEach((cat2) => pairs.push({ cat1, cat2 }));
    } else {
      pairs.push({ cat1, cat2: "" });
    }
  });
  if (pairs.length === 0) { alert("해당 파트의 기본 업무 목록이 없습니다."); return; }

  const btn = $("initDefaultTasksBtn");
  if (btn) { btn.disabled = true; btn.textContent = "생성 중…"; }

  let created = 0;
  for (const { cat1, cat2 } of pairs) {
    try {
      const res = await api("POST", "/api/tasks", {
        title:    cat2 || cat1,
        cat1,
        category: cat2,
        status:   "waiting",
        subtasks: [],
      });
      S.tasks.unshift(res.task);
      created++;
    } catch { /* skip */ }
  }
  alert(`✅ ${created}개 기본 업무를 생성했습니다.`);
  renderMyTasks();
}

/* ── 지난주 / 작년동기 불러오기 ─────────────────────────── */
async function importPrevWeekTasks() {
  const { year, week } = todayYW();
  const { year: py, week: pw } = prevWeek(year, week);
  const memberId = S.taskTargetMemberId || S.member.id;
  try {
    const data = await api("GET", `/api/reports?year=${py}&week=${pw}&memberId=${memberId}`);
    const reports = Array.isArray(data) ? data : (data.reports || []);
    if (!reports.length) { alert(`지난 주(${weekLabel(py, pw)}) 업무 기록이 없습니다.`); return; }
    const tasks = reports[0].tasks || [];
    const inProgress = tasks.filter((t) => !t.status || t.status === "in_progress" || t.status === "waiting");
    if (!inProgress.length) { alert("지난 주 진행 중 업무가 없습니다."); return; }
    openImportWeekModal(inProgress, `↩ 지난 주 진행중 업무 (${weekLabel(py, pw)})`);
  } catch (e) { alert("불러오기 실패: " + e.message); }
}

async function importLastYearWeekTasks() {
  const { year, week } = todayYW();
  const memberId = S.taskTargetMemberId || S.member.id;
  try {
    const data = await api("GET", `/api/reports?year=${year - 1}&week=${week}&memberId=${memberId}`);
    const reports = Array.isArray(data) ? data : (data.reports || []);
    if (!reports.length) { alert(`작년 동기(${weekLabel(year - 1, week)}) 업무 기록이 없습니다.`); return; }
    const tasks = reports[0].tasks || [];
    if (!tasks.length) { alert("작년 동기 업무가 없습니다."); return; }
    openImportWeekModal(tasks, `📅 작년 동기 업무 (${weekLabel(year - 1, week)})`);
  } catch (e) { alert("불러오기 실패: " + e.message); }
}

function openImportWeekModal(taskItems, title) {
  const modal = $("modal");
  const card = $("modalCard");

  const itemsHtml = taskItems.map((t, i) => {
    const c1 = t.cat1 || "";
    const c2 = t.cat2 || t.category || "";
    const catLabel = c1 && c2 ? `${c1} › ${c2}` : (c1 || c2);
    const mainText = t.text || t.title || "";
    const showMain = mainText && mainText !== c2 && mainText !== c1;
    const statusLbl = { in_progress: "진행중", done: "완료", hold: "보류" }[t.status] || "";
    const dateStr = t.date ? t.date.slice(5).replace("-", "/") : (t.due_date ? t.due_date.slice(5).replace("-", "/") : "");
    const sub = [statusLbl, dateStr ? `마감 ${dateStr}` : ""].filter(Boolean).join(" · ");
    const subs = (t.subtasks || []).filter((s) => s.text?.trim());
    return `
      <label class="import-task-item selected" data-idx="${i}">
        <input type="checkbox" value="${i}" checked />
        <div style="min-width:0;flex:1">
          ${catLabel ? `<div class="import-task-cat">${esc(catLabel)}</div>` : ""}
          ${showMain ? `<div class="import-task-text">${esc(mainText)}</div>` : ""}
          ${!catLabel && !showMain ? `<div class="import-task-text">${esc(mainText)}</div>` : ""}
          ${subs.length ? `<div class="import-task-subs">${subs.map((s) => `<span>· ${esc(s.text)}</span>`).join("")}</div>` : ""}
          ${sub ? `<div class="import-task-sub">${esc(sub)}</div>` : ""}
        </div>
      </label>`;
  }).join("");

  card.innerHTML = `
    <div class="modal-title">${esc(title)}</div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn-ghost small" id="importSelAll">전체 선택</button>
      <button class="btn-ghost small" id="importDeselAll">전체 해제</button>
    </div>
    <div class="import-task-list">${itemsHtml}</div>
    <div class="modal-actions">
      <button class="btn-ghost" id="closeModal">취소</button>
      <button class="btn-primary" id="confirmImport">이번 주 업무에 추가</button>
    </div>
  `;

  card.querySelectorAll(".import-task-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.type === "checkbox") return;
      const cb = el.querySelector("input[type=checkbox]");
      cb.checked = !cb.checked;
      el.classList.toggle("selected", cb.checked);
    });
    el.querySelector("input[type=checkbox]").addEventListener("change", (e) => {
      el.classList.toggle("selected", e.target.checked);
    });
  });

  modal.classList.remove("hidden");
  $("closeModal").addEventListener("click", closeModal);
  $("importSelAll").addEventListener("click", () => {
    card.querySelectorAll(".import-task-item input[type=checkbox]").forEach((cb) => {
      cb.checked = true;
      cb.closest(".import-task-item").classList.add("selected");
    });
  });
  $("importDeselAll").addEventListener("click", () => {
    card.querySelectorAll(".import-task-item input[type=checkbox]").forEach((cb) => {
      cb.checked = false;
      cb.closest(".import-task-item").classList.remove("selected");
    });
  });
  $("confirmImport").addEventListener("click", () => {
    const checked = [...card.querySelectorAll(".import-task-item input[type=checkbox]:checked")]
      .map((cb) => parseInt(cb.value, 10));
    if (!checked.length) { alert("업무를 선택하세요."); return; }
    checked.forEach((idx) => {
      const t = taskItems[idx];
      S.weekTasks.push({
        text: t.text || t.title || "",
        status: t.status === "done" ? "done" : "in_progress",
        date: t.date || t.due_date || "",
        cat1: t.cat1 || "",
        cat2: t.cat2 || t.category || "",
        subtasks: (t.subtasks || []).filter((s) => s.text?.trim()).map((s) => ({
          ...s, status: s.status === "done" ? "done" : "in_progress", done: s.done || s.status === "done",
        })),
      });
    });
    renderWeekTasksList();
    closeModal();
  });
}

/* ── Utils ────────────────────────────────────────────── */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── Event wiring ─────────────────────────────────────── */
function wireEvents() {
  $("loginBtn").addEventListener("click", doLogin);
  $("loginPin").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  // PIN 변경 토글
  $("showChangePinBtn").addEventListener("click", () => {
    const form = $("changePinForm");
    const isHidden = form.classList.toggle("hidden");
    const card = document.querySelector(".login-card");
    // PIN 폼 열릴 때 카드 패딩 축소, 닫힐 때 원복
    if (card) card.classList.toggle("pin-form-open", !isHidden);
    $("showChangePinBtn").textContent = isHidden ? "🔑 PIN 변경" : "✕ 닫기";
    $("changePinMsg").textContent = "";
    // 폼이 열리면 스크롤을 아래로 내려 이름 선택 필드가 보이게
    if (!isHidden) setTimeout(() => form.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  });
  $("changePinBtn").addEventListener("click", doChangePin);
  $("logoutBtn").addEventListener("click", () => {
    stopPolling();
    S.token = null;
    S.member = null;
    localStorage.removeItem("smc_token");
    $("app").classList.add("hidden");
    $("loginOverlay").classList.remove("hidden");
    $("loginPin").value = "";
    loadMemberList();
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Dashboard week nav
  $("dashPrevWeek").addEventListener("click", () => {
    Object.assign(S.dash, prevWeek(S.dash.year, S.dash.week));
    renderDashboard();
  });
  $("dashNextWeek").addEventListener("click", () => {
    Object.assign(S.dash, nextWeek(S.dash.year, S.dash.week));
    renderDashboard();
  });
  $("dashThisWeek").addEventListener("click", () => {
    const { year, week } = todayYW();
    S.dash = { year, week };
    renderDashboard();
  });
  $("addWeekTaskBtn").addEventListener("click", () => {
    if (S.reportSubmitted) {
      showToast("⚠️ 이미 제출된 업무입니다. 추가할 수 없습니다.", "error");
      return;
    }
    openTaskModal(null, { addToWeek: true });
  });
  $("sortTasksBtn")?.addEventListener("click", sortMyTasks);
  $("importWeekTasksBtn").addEventListener("click", () => {
    if (S.reportSubmitted) { showToast("⚠️ 이미 제출된 업무입니다. 추가할 수 없습니다.", "error"); return; }
    openTaskImportModal();
  });
  $("importPrevWeekBtn")?.addEventListener("click", () => {
    if (S.reportSubmitted) { showToast("⚠️ 이미 제출된 업무입니다. 추가할 수 없습니다.", "error"); return; }
    importPrevWeekTasks();
  });
  $("importLastYearBtn")?.addEventListener("click", () => {
    if (S.reportSubmitted) { showToast("⚠️ 이미 제출된 업무입니다. 추가할 수 없습니다.", "error"); return; }
    importLastYearWeekTasks();
  });
  $("saveReport").addEventListener("click", () => saveReport(false));
  $("submitReport").addEventListener("click", () => saveReport(true));
  $("taskTargetSel")?.addEventListener("change", async (e) => {
    S.taskTargetMemberId = e.target.value || null;
    await renderMyTasks();
  });
  $("addRecurringBtn")?.addEventListener("click", () => openRecurringModal(null));
  $("addTaskBtn").addEventListener("click", () => openTaskModal(null, { simple: true }));
  $("headerBrand")?.addEventListener("click", () => switchTab("dashboard"));

  $("teamRefreshBtn").addEventListener("click", () => renderTeam());

  // Team week nav
  $("teamPrevWeek").addEventListener("click", () => {
    Object.assign(S.team, prevWeek(S.team.year, S.team.week));
    renderTeam();
  });
  $("teamNextWeek").addEventListener("click", () => {
    Object.assign(S.team, nextWeek(S.team.year, S.team.week));
    renderTeam();
  });

  // Calendar month nav
  $("calPrevMonth").addEventListener("click", () => {
    if (S.cal.month === 1) { S.cal.year--; S.cal.month = 12; }
    else S.cal.month--;
    renderCalendar();
  });
  $("calNextMonth").addEventListener("click", () => {
    if (S.cal.month === 12) { S.cal.year++; S.cal.month = 1; }
    else S.cal.month++;
    renderCalendar();
  });
  $("calTodayBtn").addEventListener("click", () => {
    const now = new Date();
    S.cal = { year: now.getFullYear(), month: now.getMonth() + 1 };
    renderCalendar();
  });
  // 캘린더 날짜 팝업
  $("calDateModalClose").addEventListener("click", closeCalDateModal);
  $("calDateModal").addEventListener("click", (e) => {
    if (e.target === $("calDateModal")) closeCalDateModal();
  });
  $("popAddEventBtn").addEventListener("click", addEventFromPopup);

  $("popEventType").addEventListener("change", () => {
    const v = $("popEventType").value;
    if (v === "birthday") {
      const s = $("popRepeatSolar"); if (s) s.checked = true;
    } else if (["vacation","business_trip","education"].includes(v)) {
      const n = $("popRepeatNone"); if (n) n.checked = true;
    }
    updatePopEventDateHint();
  });
  document.querySelectorAll('input[name="popEventRepeat"]').forEach((r) => {
    r.addEventListener("change", updatePopEventDateHint);
  });

  // 브리핑 접기/펼치기
  $("calBriefingToggle")?.addEventListener("click", () => {
    const list = $("calBriefingList");
    const btn = $("calBriefingToggle");
    const isHidden = list.classList.toggle("hidden");
    btn.textContent = isHidden ? "펼치기 ▼" : "접기 ▲";
  });

  // 캘린더 팀원 검색
  $("calSearchInput").addEventListener("input", (e) => {
    if (S.calSearchMemberId) {
      S.calSearchMemberId = null;
    }
    showCalSearchDropdown(e.target.value);
  });
  $("calSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      $("calSearchDropdown").classList.add("hidden");
      if (S.calSearchMemberId) { S.calSearchMemberId = null; renderCalendar(); }
    }
  });
  $("calSearchClear").addEventListener("click", () => {
    S.calSearchMemberId = null;
    $("calSearchInput").value = "";
    $("calSearchDropdown").classList.add("hidden");
    renderCalendar();
  });
  // 드롭다운 외부 클릭 시 닫기
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".cal-search-row")) {
      $("calSearchDropdown")?.classList.add("hidden");
    }
  });

  updatePopEventDateHint();

  // Archive
  $("archiveView").addEventListener("change", updateArchiveSelectors);
  $("archiveSearch").addEventListener("click", doArchiveSearch);
  $("archiveDoneOnly").addEventListener("change", doArchiveSearch);
  $("archivePdfBtn").addEventListener("click", exportArchivePdf);

  // 취합 편집 토글
  $("archiveCompileToggle").addEventListener("click", () => {
    const bar = $("archiveCompileBar");
    const active = bar.classList.toggle("hidden") === false;
    $("archiveCompileToggle").classList.toggle("active", active);
    if (active) {
      document.querySelectorAll("#archiveResult .archive-item[data-item]").forEach((el) => {
        if (!el.querySelector(".compile-cb")) {
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "compile-cb";
          cb.addEventListener("change", updateCompileCount);
          el.prepend(cb);
        }
      });
      populateCompileWeekSelect();
    } else {
      document.querySelectorAll(".compile-cb").forEach((cb) => cb.remove());
    }
    updateCompileCount();
  });

  $("archiveCompileClear").addEventListener("click", () => {
    document.querySelectorAll(".compile-cb:checked").forEach((cb) => (cb.checked = false));
    updateCompileCount();
  });

  $("archiveCompileAdd").addEventListener("click", async () => {
    const checked = [...document.querySelectorAll(".compile-cb:checked")];
    if (!checked.length) return;
    const weekKey = $("archiveCompileWeekSel").value;
    const newItems = checked.map((cb) => {
      const data = JSON.parse(cb.closest(".archive-item").dataset.item);
      return { ...data, id: genLocalId() };
    });
    const existing = (await api("GET", `/api/compilation?week=${weekKey}`)).items || [];
    const merged = [...existing];
    newItems.forEach((item) => {
      if (!merged.some((e) => e.text === item.text && e.memberName === item.memberName)) {
        merged.push(item);
      }
    });
    await api("PUT", "/api/compilation", { week: weekKey, items: merged });
    showToast(`&#10003; ${newItems.length}개 항목이 취합본(${weekKey})에 추가됐습니다.`);
    checked.forEach((cb) => (cb.checked = false));
    updateCompileCount();
  });

  // 주차별 취합 네비게이션
  $("compPrevWeek").addEventListener("click", () => {
    let { year, week } = S.comp;
    week--;
    if (week <= 0) { year--; week = 52; }
    S.comp = { ...S.comp, year, week };
    renderCompilation();
  });
  $("compNextWeek").addEventListener("click", () => {
    let { year, week } = S.comp;
    week++;
    if (week > 52) { year++; week = 1; }
    S.comp = { ...S.comp, year, week };
    renderCompilation();
  });
  $("compThisWeek").addEventListener("click", () => {
    S.comp = { ...S.comp, year: S.dash.year, week: S.dash.week };
    renderCompilation();
  });

  // PDF 내보내기
  $("compPdfBtn").addEventListener("click", async () => {
    const { year, week } = S.comp;
    const ws = weekStart(year, week), we = weekEnd(year, week);
    const fmt    = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}`;
    const fmtMD  = (d) => `${d.getMonth()+1}/${d.getDate()}`;
    const isoFmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const wkRange   = `${fmt(ws)} ~ ${fmt(we)}`;
    const title     = `경영지원팀 주간업무`;
    const subTitle  = `${weekLabel(year, week)} (${wkRange})`;
    const content   = document.getElementById("compilationResult").innerHTML;
    const printDate = fmt(new Date());

    // ── 해당 주 캘린더 이벤트 조회 ──
    // group: 생일/휴가/출장/교육 등으로 묶어서 표시
    let weekEventGroups = {}; // { group: [{ icon, name, dateStr, subLabel }, ...] }
    try {
      const startStr = isoFmt(ws), endStr = isoFmt(we);
      const evData = await api("GET", `/api/events?start=${startStr}&end=${endStr}`);
      // 생일: S.members에서 해당 주 생일인 멤버 추가
      const bdaySet = new Set(evData.filter(e => e.type === "birthday").map(e => e.member_id));
      S.members.forEach(m => {
        if (!m.birthday || bdaySet.has(m.id)) return;
        const parts = m.birthday.split("-");
        const bday = new Date(ws.getFullYear(), parseInt(parts[1],10)-1, parseInt(parts[2],10));
        if (bday >= ws && bday <= we) {
          evData.push({ type: "birthday", isBirthday: true, member: m, start_date: isoFmt(bday) });
        }
      });
      evData.forEach(e => {
        const cfg = EVENT_TYPES[e.type] || { label: e.type, icon: "📅", group: e.type };
        const group = cfg.group || cfg.label;
        const name = e.member?.name || e.title || "";
        const sd = e.start_date ? new Date(e.start_date + "T00:00:00") : null;
        const ed = e.end_date   ? new Date(e.end_date   + "T00:00:00") : null;
        const dateStr = sd && ed && isoFmt(sd) !== isoFmt(ed)
          ? `${fmtMD(sd)}~${fmtMD(ed)}` : (sd ? fmtMD(sd) : "");
        // 휴가 세부유형 표시 (반차/반반차 등)
        const subLabel = e.type !== "vacation" && cfg.group === "휴가" ? cfg.label : "";
        if (!weekEventGroups[group]) weekEventGroups[group] = { icon: cfg.icon, items: [] };
        weekEventGroups[group].items.push({ name, dateStr, subLabel });
      });
    } catch(e) { /* 이벤트 조회 실패 시 무시 */ }
    const printWin = window.open("", "_blank", "width=1200,height=800");
    printWin.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${title} ${subTitle}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; background: #fff; color: #111827; padding: 24px 28px; font-size: 13px; }
        /* ─ 헤더 ─ */
        .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #1b64da; padding-bottom: 10px; margin-bottom: 18px; gap: 24px; }
        .pdf-header-left { flex: 0 0 auto; }
        .pdf-title { font-size: 20px; font-weight: 800; color: #1b64da; letter-spacing: -0.3px; }
        .pdf-subtitle { font-size: 13px; color: #374151; margin-top: 3px; font-weight: 500; }
        /* ─ 이벤트 그룹 영역 ─ */
        .pdf-events { flex: 1; display: flex; flex-direction: column; gap: 5px; padding-top: 4px; }
        .pdf-event-line { font-size: 12px; color: #374151; display: flex; align-items: baseline; gap: 6px; }
        .pdf-event-group-label { font-weight: 700; white-space: nowrap; }
        .pdf-event-group-label.생일 { color: #b45309; }
        .pdf-event-group-label.휴가 { color: #065f46; }
        .pdf-event-group-label.출장 { color: #1e40af; }
        .pdf-event-people { color: #4b5563; }
        /* ─ 4열 그리드 ─ */
        .comp-parts-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: start; }
        .comp-part-col { border: 1.5px solid #d1d5db; border-radius: 8px; overflow: hidden; }
        .comp-part-col-head { background: #1b64da; color: #fff; font-size: 12px; font-weight: 700; padding: 7px 10px; text-align: center; letter-spacing: 0.02em; }
        /* ─ cat1 섹션 ─ */
        .comp-cat1-section { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; }
        .comp-cat1-section:last-child { border-bottom: none; }
        .comp-cat1-head { font-size: 12px; font-weight: 800; color: #1b64da; border-bottom: 1.5px solid #bfdbfe; padding-bottom: 3px; margin-bottom: 6px; }
        .comp-drag-handle { display: none; }
        /* ─ 업무 항목 ─ */
        .archive-items { display: flex; flex-direction: column; }
        .archive-item { display: flex; align-items: flex-start; gap: 6px; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
        .archive-item:last-child { border-bottom: none; }
        .archive-item-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; background: #9ca3af; margin-top: 5px; }
        .archive-item.done .archive-item-dot { background: #16a34a; }
        .archive-item.in_progress .archive-item-dot { background: #3182f6; }
        .archive-item.hold .archive-item-dot { background: #eab308; }
        .archive-item.waiting .archive-item-dot { background: #f59e0b; }
        .arc-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .arc-cats { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .arc-cat2 { font-size: 12px; font-weight: 700; color: #111827; }
        .arc-main-text { font-size: 11px; color: #6b7280; }
        .comp-member-inline { font-size: 10px; color: #9ca3af; }
        .archive-task-weeks { font-size: 10px; color: #9ca3af; }
        .comp-status-prog { font-size: 10px; color: #3182f6; background: #eff6ff; border-radius: 3px; padding: 1px 4px; }
        .arc-status-badge { font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 6px; }
        .arc-status-badge.done { background: #dcfce7; color: #16a34a; }
        .arc-status-badge.hold { background: #fef9c3; color: #a16207; }
        .arc-status-badge.waiting { background: #fef3c7; color: #d97706; }
        .arc-subs { display: flex; flex-direction: column; gap: 1px; padding-left: 6px; margin-top: 2px; }
        .arc-sub-row { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #6b7280; }
        .arc-sub-row.done .arc-sub-text { text-decoration: line-through; color: #9ca3af; }
        .arc-sub-dot { width: 3px; height: 3px; border-radius: 50%; flex-shrink: 0; background: #d1d5db; }
        .arc-sub-date { font-size: 10px; color: #9ca3af; }
        /* ─ 숨길 요소 ─ */
        .comp-item-del, .comp-col-empty, .empty-state, .loading { display: none; }
        @media print {
          body { padding: 16px 18px; }
          .comp-parts-grid { gap: 8px; }
          @page { margin: 1cm; size: A4 landscape; }
        }
      </style>
    </head><body>
      <div class="pdf-header">
        <div class="pdf-header-left">
          <div class="pdf-title">📋 ${title}</div>
          <div class="pdf-subtitle">${subTitle}</div>
        </div>
        ${Object.keys(weekEventGroups).length ? `
        <div class="pdf-events">
          ${Object.entries(weekEventGroups).map(([group, { icon, items }]) => {
            const people = items.map(it => {
              let txt = it.name;
              if (it.dateStr) txt += `(${it.dateStr})`;
              if (it.subLabel) txt += ` [${it.subLabel}]`;
              return txt;
            }).join(", ");
            return `<div class="pdf-event-line"><span class="pdf-event-group-label ${group}">${icon} ${group}:</span><span class="pdf-event-people">${people}</span></div>`;
          }).join("")}
        </div>` : ""}
        <div style="font-size:11px;color:#9ca3af;text-align:right;flex-shrink:0">출력일: ${printDate}</div>
      </div>
      ${content}
    </body></html>`);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); }, 600);
  });

  // 받은 피드백 토글
  $("feedbacksToggleBtn")?.addEventListener("click", () => {
    const list = $("myFeedbacksList");
    const btn = $("feedbacksToggleBtn");
    const isHidden = list.classList.toggle("hidden");
    btn.textContent = isHidden ? "펼치기" : "접기";
  });

  // Admin
  // 관리자 PIN 인증
  $("adminPinConfirm").addEventListener("click", verifyAdminPin);
  $("adminPinInput").addEventListener("keydown", (e) => { if (e.key === "Enter") verifyAdminPin(); });

  $("addMemberBtn").addEventListener("click", () => openMemberModal(null));

  // Modal close on overlay click
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
}

/* ── 주차별 취합 ───────────────────────────────────────── */
function updateCompileCount() {
  const n = document.querySelectorAll(".compile-cb:checked").length;
  $("archiveCompileCount").textContent = `${n}개 선택됨`;
  $("archiveCompileAdd").disabled = n === 0;
}

function populateCompileWeekSelect() {
  const sel = $("archiveCompileWeekSel");
  sel.innerHTML = "";
  const { year: cy, week: cw } = S.dash;
  for (let i = 0; i < 8; i++) {
    let y = cy, w = cw - i;
    while (w <= 0) { y--; w += 52; }
    const key = `${y}-W${String(w).padStart(2, "0")}`;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = weekLabel(y, w);
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function renderCompilation() {
  if (!S.comp.year) S.comp = { year: S.dash.year, week: S.dash.week };
  const { year, week } = S.comp;
  $("compWeekLabel").textContent = weekLabel(year, week);

  const result = $("compilationResult");
  result.innerHTML = '<div class="loading">불러오는 중...</div>';

  let data;
  try {
    const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
    data = await api("GET", `/api/compilation?week=${weekKey}`);
  } catch {
    result.innerHTML = '<div class="empty-state">데이터를 불러올 수 없습니다.</div>';
    return;
  }

  const items = data.items || [];
  const currentOrder = data.order || {}; // { 파트명: [cat1, cat1, ...] }

  if (items.length === 0) {
    result.innerHTML = `<div class="empty-state"><div class="empty-icon">&#128203;</div>취합된 항목이 없습니다.<br><span style="font-size:13px;color:var(--muted)">업무 아카이빙에서 항목을 선택해 취합본에 추가하세요.</span></div>`;
    return;
  }

  result.innerHTML = "";

  const weekKey = `${year}-W${String(week).padStart(2, "0")}`;

  // subtasks 없는 항목은 해당 주 리포트에서 자동 보완 후 재저장
  if (items.some(it => !it.subtasks)) {
    try {
      const reports = await api("GET", `/api/reports?year=${year}&week=${week}`);
      const reportByName = {};
      reports.forEach(r => {
        if (r.member?.name) reportByName[r.member.name] = getReportTasks(r);
      });
      let changed = false;
      items.forEach(it => {
        if (!it.subtasks) {
          const tasks = reportByName[it.memberName] || [];
          const match = tasks.find(t =>
            (t.cat2 || t.category || "") === (it.cat2 || "") &&
            (t.cat1 || "") === (it.cat1 || "")
          );
          it.subtasks = (match?.subtasks || []).filter(s => s.text?.trim()).map(s => ({
            text: s.text, status: s.status || "in_progress", due_date: s.due_date || "",
          }));
          changed = true;
        }
      });
      // 보완된 데이터 서버에 다시 저장 (order 유지)
      if (changed) {
        await api("PUT", "/api/compilation", { week: weekKey, items, order: currentOrder });
      }
    } catch (e) { /* 보완 실패 시 무시 */ }
  }

  // 해당 주 날짜 범위
  const ws = weekStart(year, week), we = weekEnd(year, week);
  const fmt = (d) => `${d.getMonth()+1}/${d.getDate()}`;
  const weekRangeLabel = `${fmt(ws)}~${fmt(we)}`;

  const sLabel = { in_progress: "진행중", done: "완료", hold: "보류", waiting: "계획" };

  // ── archive-item 행 생성: cat2 · 담당자 · 날짜범위 인라인 ──
  const makeItemRow = (item) => {
    const st = _WEEK_LEGACY[item.status] || item.status || "in_progress";
    const cat2 = item.cat2 || "";
    const subs = (item.subtasks || []).filter(s => s.text?.trim());
    const hasMainText = item.text && item.text !== cat2 && item.text !== (item.cat1 || "");

    const showBadge = st !== "in_progress";
    const badgeHtml = showBadge ? `<span class="arc-status-badge ${st}">${sLabel[st]}</span>` : "";

    // cat2 · 담당자 · 상태표시 한 줄에
    // 진행중이면 날짜 대신 "진행" 텍스트만, 그 외에는 날짜범위
    const memberHtml = item.memberName ? `<span class="comp-member-inline">${esc(item.memberName)}</span>` : "";
    const wkHtml = st === "in_progress"
      ? `<span class="comp-status-prog">진행</span>`
      : `<span class="archive-task-weeks">${weekRangeLabel}</span>`;

    const cat2Html = cat2 ? `<span class="arc-cat2">${esc(cat2)}</span>` : "";
    // 본문 텍스트가 없으면 cat2 행에 담당자+날짜 인라인
    const catHtml = cat2Html
      ? `<div class="arc-cats">${cat2Html}${!hasMainText ? `${memberHtml}${wkHtml}` : ""}</div>` : "";

    const mainText = hasMainText
      ? `<span class="arc-main-text">${esc(item.text)}${memberHtml}${wkHtml}</span>` : "";

    const subsHtml = subs.length
      ? `<div class="arc-subs">${subs.map(s => {
          const sSt = _WEEK_LEGACY[s.status] || s.status || "in_progress";
          const done = s.done || sSt === "done";
          const sDate = s.due_date ? s.due_date.slice(5).replace("-", "/") : "";
          const sDateHtml = sDate ? `<span class="arc-sub-date">(${sDate})</span>` : "";
          return `<div class="arc-sub-row${done ? " done" : ""}"><span class="arc-sub-dot"></span><span class="arc-sub-text">${esc(s.text)}</span>${sDateHtml}</div>`;
        }).join("")}</div>`
      : "";

    const row = document.createElement("div");
    row.className = `archive-item ${st}`;
    row.innerHTML = `
      <span class="archive-item-dot"></span>
      <div class="arc-item-body">${catHtml}${mainText}${badgeHtml}${subsHtml}</div>
      <button class="comp-item-del" title="삭제">✕</button>
    `;
    row.querySelector(".comp-item-del").addEventListener("click", async () => {
      const fresh = await api("GET", `/api/compilation?week=${weekKey}`);
      const cur = fresh.items || [];
      const latestOrder = fresh.order || currentOrder;
      const updated = cur.filter((e) => e.id !== item.id);
      await api("PUT", "/api/compilation", { week: weekKey, items: updated, order: latestOrder });
      renderCompilation();
    });
    return row;
  };

  // ── 4열 파트 컬럼 레이아웃 ────────────────────────────────────
  const COMP_PARTS = ["구매파트", "의공파트", "재무관리파트", "경영관리파트"];

  // 파트 → cat1 → items 그룹화
  const byPart = {};
  COMP_PARTS.forEach(p => { byPart[p] = {}; });
  items.forEach(item => {
    const part = COMP_PARTS.includes(item.memberPart) ? item.memberPart : COMP_PARTS[COMP_PARTS.length - 1];
    const c1 = item.cat1 || "기타";
    if (!byPart[part][c1]) byPart[part][c1] = [];
    byPart[part][c1].push(item);
  });

  // 드래그 상태 추적
  let _dragPart = null, _dragCat1 = null;

  const grid = document.createElement("div");
  grid.className = "comp-parts-grid";

  COMP_PARTS.forEach(part => {
    const col = document.createElement("div");
    col.className = "comp-part-col";

    const colHead = document.createElement("div");
    colHead.className = "comp-part-col-head";
    colHead.textContent = part;
    col.appendChild(colHead);

    const cat1Map = byPart[part];

    // currentOrder[part] 기준으로 정렬, 없는 항목은 가나다순 뒤에
    const cat1Keys = Object.keys(cat1Map).sort((a, b) => {
      const ord = currentOrder[part] || [];
      const ai = ord.indexOf(a), bi = ord.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b, "ko");
    });

    if (cat1Keys.length === 0) {
      const empty = document.createElement("div");
      empty.className = "comp-col-empty";
      empty.textContent = "항목 없음";
      col.appendChild(empty);
    } else {
      cat1Keys.forEach(cat1 => {
        const catItems = cat1Map[cat1];
        catItems.sort((a, b) =>
          (a.cat2 || "").localeCompare(b.cat2 || "", "ko") ||
          (a.memberName || "").localeCompare(b.memberName || "", "ko")
        );

        const section = document.createElement("div");
        section.className = "comp-cat1-section";
        section.draggable = true;
        section.dataset.part = part;
        section.dataset.cat1 = cat1;

        const catHead = document.createElement("div");
        catHead.className = "comp-cat1-head";
        catHead.innerHTML = `<span class="comp-drag-handle" title="드래그로 순서 변경">⠿</span>${esc(cat1)}`;
        section.appendChild(catHead);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "archive-items";
        catItems.forEach(item => itemsWrap.appendChild(makeItemRow(item)));
        section.appendChild(itemsWrap);

        // ── 드래그앤드롭 이벤트 ──
        section.addEventListener("dragstart", (e) => {
          _dragPart = part; _dragCat1 = cat1;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", `${part}::${cat1}`);
          setTimeout(() => section.classList.add("comp-drag-source"), 0);
        });
        section.addEventListener("dragend", () => {
          section.classList.remove("comp-drag-source");
          grid.querySelectorAll(".comp-drag-over").forEach(el => el.classList.remove("comp-drag-over"));
          _dragPart = null; _dragCat1 = null;
        });
        section.addEventListener("dragover", (e) => {
          if (_dragPart !== part || _dragCat1 === cat1) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          grid.querySelectorAll(".comp-drag-over").forEach(el => el.classList.remove("comp-drag-over"));
          section.classList.add("comp-drag-over");
        });
        section.addEventListener("dragleave", (e) => {
          if (!section.contains(e.relatedTarget)) section.classList.remove("comp-drag-over");
        });
        section.addEventListener("drop", async (e) => {
          e.preventDefault();
          section.classList.remove("comp-drag-over");
          const srcCat1 = _dragCat1, srcPart = _dragPart;
          if (!srcCat1 || srcPart !== part || srcCat1 === cat1) return;

          // 현재 파트의 표시 순서에서 srcCat1을 tgtCat1 앞으로 이동
          const displayed = [...cat1Keys]; // 드롭 당시 화면 순서
          const filtered = displayed.filter(k => k !== srcCat1);
          const tgtIdx = filtered.indexOf(cat1);
          filtered.splice(tgtIdx >= 0 ? tgtIdx : filtered.length, 0, srcCat1);
          currentOrder[part] = filtered;

          // 저장
          await api("PUT", "/api/compilation", { week: weekKey, items, order: currentOrder });
          renderCompilation();
        });

        col.appendChild(section);
      });
    }

    grid.appendChild(col);
  });

  result.appendChild(grid);
}

/* ── Boot ─────────────────────────────────────────────── */
/* ── 서버 혼잡도 체크 + 대기실 ──────────────────────────── */
let _waitingInterval = null;

async function checkServerStatus() {
  try {
    const res = await fetch("/api/status");
    return await res.json();
  } catch {
    return { busy: false }; // 상태 확인 실패 시 그냥 진행
  }
}

/**
 * 대기실 표시 후 서버가 한가해지면 onReady() 호출
 * @param {Function} onReady - 접속 가능해졌을 때 실행할 콜백
 * @param {number} retryAfterSec - 재시도 간격(초)
 */
function startWaiting(onReady, retryAfterSec = 5) {
  const wr = $("waitingRoom");
  const loginCard = $("loginCard");
  if (wr) wr.classList.remove("hidden");
  if (loginCard) loginCard.style.display = "none";

  let remaining = retryAfterSec;
  const cd = $("waitingCountdown");
  const tick = () => {
    if (cd) cd.textContent = `${remaining}초 후 재시도…`;
    remaining--;
  };
  tick();

  clearInterval(_waitingInterval);
  _waitingInterval = setInterval(async () => {
    if (remaining > 0) { tick(); return; }
    clearInterval(_waitingInterval);
    const status = await checkServerStatus();
    if (!status.busy) {
      // 접속 가능 → 대기실 숨기고 로그인 화면 표시
      if (wr) wr.classList.add("hidden");
      if (loginCard) loginCard.style.display = "";
      onReady();
    } else {
      // 아직 바쁨 → 재시도
      startWaiting(onReady, retryAfterSec);
    }
  }, 1000);
}

async function boot() {
  wireEvents();

  const continueLogin = async () => {
    await loadMemberList();
    const ok = await tryAutoLogin();
    if (ok) enterApp();
  };

  // 서버 혼잡 여부 먼저 체크
  const status = await checkServerStatus();
  if (status.busy) {
    startWaiting(continueLogin, 5);
    return;
  }

  await continueLogin();
}

boot();
