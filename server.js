import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// ── 음력 → 양력 변환 (Intl API 활용) ─────────────────────────────────────────
const _pad = (n) => String(n).padStart(2, "0");
function localDateKey(d) {
  // UTC 변환 없이 로컬 날짜 문자열 반환 (시간대 버그 방지)
  return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
}

function lunarToSolar(year, _unused, lunarMonth, lunarDay) {
  if (!lunarMonth || !lunarDay) return null;
  const lunarFmt = (() => {
    try { return new Intl.DateTimeFormat("ko-u-ca-chinese", { month: "numeric", day: "numeric" }); }
    catch { return null; }
  })();
  if (!lunarFmt) return null;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = isLeap ? 366 : 365;
  for (let i = 0; i < days; i++) {
    const d = new Date(year, 0, 1 + i);  // 로컬 날짜 생성
    try {
      const parts = lunarFmt.formatToParts(d);
      const lm = parseInt(parts.find(p => p.type === "month")?.value || "0", 10);
      const ld = parseInt(parts.find(p => p.type === "day")?.value || "0", 10);
      if (lm === lunarMonth && ld === lunarDay) {
        return localDateKey(d);  // UTC 변환 없이 로컬 기준 반환
      }
    } catch {}
  }
  return null;
}

// ── 생일 이벤트 upsert ────────────────────────────────────────────────────────
function upsertBirthdayEvent(db, memberId, birthday, birthdayType) {
  if (!db.events) db.events = [];
  // 기존 생일 이벤트 제거
  db.events = db.events.filter((e) => !(e.member_id === memberId && e.type === "birthday"));

  const parts = birthday.split("-");
  const now = new Date().toISOString();
  let startDate = birthday;
  let lunarMonth = null, lunarDay = null;
  let repeatType = "yearly";

  if (birthdayType === "lunar") {
    lunarMonth = parseInt(parts[1], 10);
    lunarDay = parseInt(parts[2], 10);
    repeatType = "yearly_lunar";
    // 이번 연도 양력 날짜로 변환
    const currentYear = new Date().getFullYear();
    const solarDate = lunarToSolar(currentYear, null, lunarMonth, lunarDay);
    startDate = solarDate || birthday;
  }

  const ev = {
    id: genId(),
    member_id: memberId,
    type: "birthday",
    start_date: startDate,
    end_date: startDate,
    note: "생일",
    repeat: repeatType,
    created_at: now,
    updated_at: now,
  };
  if (birthdayType === "lunar" && lunarMonth && lunarDay) {
    ev.lunar_month = lunarMonth;
    ev.lunar_day = lunarDay;
  }
  db.events.push(ev);
}

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
// Vercel 프로덕션 환경에서는 /tmp에 저장 (파일시스템이 read-only이므로)
const DATA_DIR = process.env.VERCEL ? "/tmp" : join(ROOT, "data");
const DB_FILE = join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3100);


const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

// ── JWT 기반 무상태 세션 (Vercel 멀티-인스턴스 안전) ────────────────────────
// 인메모리 Map 대신 서명된 JWT 사용 → 어떤 인스턴스에서도 검증 가능
const JWT_SECRET = process.env.JWT_SECRET || "smc-scheduler-jwt-2026-secret";
const JWT_TTL = 8 * 3600; // 8시간

function _b64url(data) {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  return Buffer.from(s).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function _b64urlDec(s) {
  return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf-8");
}

// ── 동시 접속 트래킹 ──────────────────────────────────────────────────────────
let activeApiConnections = 0;
const MAX_API_CONNECTIONS = 40; // 소프트 한도 (초과 시 대기 안내)

// ── DB helpers ────────────────────────────────────────────────────────────────

function hashPin(pin) {
  return crypto.createHash("sha256").update(pin + "smc-scheduler-salt").digest("hex");
}

function genId() {
  return crypto.randomBytes(8).toString("hex");
}

// ISO 주차(year, week) → 해당 주 목요일의 월 반환 (주차 소속 월 결정 기준)
function weekToMonth(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const ms = jan4.getTime() - dayOfWeek * 86400000 + (week - 1) * 7 * 86400000;
  const thu = new Date(ms + 3 * 86400000); // 목요일
  return thu.getMonth() + 1;
}

// ── GitHub Storage (모든 인스턴스가 공유하는 영구 저장소) ─────────────────────
// GITHUB_DB_TOKEN + GITHUB_DB_REPO 환경변수가 있으면 GitHub API를 DB로 사용
// 로컬 개발: 파일 폴백, Vercel: GitHub 브랜치 'db'의 db.json
const _gh = {
  token: null, repo: null,
  cache: null, cacheSha: null, cacheAt: 0,
  writing: false, writeQueue: [],
};
const GH_CACHE_MS = 8000; // 8초 캐시 (동일 인스턴스 중복 읽기 방지)

function _ghEnabled() {
  if (!_gh.token) {
    _gh.token = process.env.GITHUB_DB_TOKEN || null;
    _gh.repo = process.env.GITHUB_DB_REPO || "xxiohc/smc-smart-scheduler";
  }
  return !!_gh.token;
}

async function _ghFetch(path, opts = {}) {
  const url = `https://api.github.com/repos/${_gh.repo}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `token ${_gh.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function _ghLoadDb() {
  const now = Date.now();
  if (_gh.cache && now - _gh.cacheAt < GH_CACHE_MS) {
    return JSON.parse(JSON.stringify(_gh.cache));
  }
  const res = await _ghFetch("/contents/db.json?ref=db");
  if (!res.ok) return null;
  const meta = await res.json();
  const content = Buffer.from(meta.content, "base64").toString("utf-8");
  _gh.cache = JSON.parse(content);
  _gh.cacheSha = meta.sha;
  _gh.cacheAt = now;
  return JSON.parse(JSON.stringify(_gh.cache));
}

async function _ghSaveDb(db) {
  const snapshot = JSON.parse(JSON.stringify(db));
  // 캐시 즉시 갱신
  _gh.cache = snapshot;
  _gh.cacheAt = Date.now();

  const _doWrite = async () => {
    // SHA 모르면 먼저 조회
    if (!_gh.cacheSha) {
      const r = await _ghFetch("/contents/db.json?ref=db");
      if (r.ok) { const m = await r.json(); _gh.cacheSha = m.sha; }
    }
    return _ghFetch("/contents/db.json", {
      method: "PUT",
      body: JSON.stringify({
        message: "db update [skip ci]",
        content: Buffer.from(JSON.stringify(snapshot)).toString("base64"),
        branch: "db",
        sha: _gh.cacheSha || undefined,
      }),
    });
  };

  let res = await _doWrite();
  if (res.status === 409) {
    // SHA 충돌 → SHA 초기화 후 1회 재시도
    _gh.cacheSha = null;
    res = await _doWrite();
  }
  if (res.ok) {
    const m = await res.json();
    _gh.cacheSha = m.content?.sha || _gh.cacheSha;
  } else {
    // 저장 실패 시 에러를 상위로 전파 (조용히 무시하지 않음)
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub DB 저장 실패 (${res.status}): ${body.slice(0, 120)}`);
  }
}

const _emptyDb = () => ({ members: [], reports: [], events: [], recurring: [], tasks: [], feedbacks: [], categories: {} });

async function loadDb() {
  if (_ghEnabled()) {
    const data = await _ghLoadDb();
    return data || _emptyDb();
  }
  try {
    const raw = await readFile(DB_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return _emptyDb();
  }
}

// ── DB 쓰기 (GitHub: 직접 / 파일: 뮤텍스 큐) ────────────────────────────────
let _dbWriteLocked = false;
const _dbWriteQueue = [];

async function saveDb(db) {
  if (_ghEnabled()) {
    return _ghSaveDb(db);
  }
  return new Promise((resolve, reject) => {
    _dbWriteQueue.push({ db: JSON.parse(JSON.stringify(db)), resolve, reject });
    _processWriteQueue();
  });
}

async function _processWriteQueue() {
  if (_dbWriteLocked || _dbWriteQueue.length === 0) return;
  _dbWriteLocked = true;
  const { db, resolve, reject } = _dbWriteQueue.shift();
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
    resolve();
  } catch (e) {
    reject(e);
  } finally {
    _dbWriteLocked = false;
    _processWriteQueue();
  }
}

// ── 초기 시드 멤버 데이터 (Vercel cold-start 등 빈 DB에서 복원) ──────────────
// PIN 기본값 "0000" → hashPin("0000") = 12ca2bf6...
// 최지석 PIN은 별도 설정됨 (41f5f6a6...)
const SEED_MEMBERS = [
  { id:"4c157e4af00eb5b0", name:"김종국",  part:"경영지원팀",  role:"admin",   pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:"", joined:"2026-05-28", birthday_type:"solar" },
  { id:"62fb2ac1be5af259", name:"나정민",  part:"경영관리파트", role:"leader",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"8b20604dd988c02b", name:"권민",    part:"경영관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"790940b814bfa92e", name:"조윤서",  part:"경영관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"4eee644771da81f9", name:"박수현",  part:"재무관리파트", role:"leader",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"4a429ee1a744739f", name:"정미선",  part:"재무관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"b7d77c1d444ecb10", name:"최지석",  part:"재무관리파트", role:"admin",   pin_hash:"41f5f6a6767a2651aaa4a82829dd20645f4719b762bbe023091d01eb3aa8abef",  birthday:"", joined:"2026-05-28", birthday_type:"solar" },
  { id:"833e341796899794", name:"권기범",  part:"재무관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"25b11342f8136f9c", name:"문지원",  part:"재무관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"b86263e231d68ecd", name:"구연정",  part:"재무관리파트", role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"0c4016d1d5aabe95", name:"박미숙",  part:"구매파트",    role:"leader",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"6564ce4e88dec65f", name:"김상엽",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"2b110b83756d1ca2", name:"심규옥",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"e31dbcb1925bdf37", name:"손정균",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"c9338f2537d8f499", name:"이준경",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"dbc2749288ea4dbe", name:"김도영",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"c7a72a1a259a5845", name:"박태순",  part:"구매파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"4edf5fe60fc215e7", name:"장성웅",  part:"의공파트",    role:"leader",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"6aff71322a76e262", name:"조원일",  part:"의공파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"729615d094789e05", name:"김정일",  part:"의공파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"f6108eadfdee85c6", name:"윤종부",  part:"의공파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"dc6516e23c0d9bd4", name:"김창진",  part:"의공파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
  { id:"09990c42d5fcf1e6", name:"김경두",  part:"의공파트",    role:"member",  pin_hash:"12ca2bf6224a0ce696cf06af5d29e30bd1e13d6c17f45a55eb152da59061cc6c", birthday:null, joined:"2026-05-28" },
];

async function ensureDefaultData() {
  const db = await loadDb();
  let dirty = false;
  if (!db.members)  { db.members  = []; dirty = true; }
  if (!db.reports)  { db.reports  = []; dirty = true; }
  if (!db.events)   { db.events   = []; dirty = true; }
  if (!db.recurring){ db.recurring= []; dirty = true; }
  if (!db.tasks)    { db.tasks    = []; dirty = true; }
  if (!db.feedbacks){ db.feedbacks= []; dirty = true; }
  if (!db.categories){ db.categories = {}; dirty = true; }
  // 빈 DB면 시드 멤버로 초기화
  if (db.members.length === 0) {
    db.members = SEED_MEMBERS.map(m => ({ ...m }));
    dirty = true;
  } else {
    // 최지석 role 보정
    const jiseok = db.members.find(m => m.id === "b7d77c1d444ecb10");
    if (jiseok && jiseok.role !== "admin") { jiseok.role = "admin"; dirty = true; }
  }
  if (dirty) await saveDb(db); // 변경된 경우에만 저장 (불필요한 GitHub write 방지)
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function createToken(memberId) {
  const hdr = _b64url({ alg: "HS256", typ: "JWT" });
  const pay = _b64url({ sub: memberId, exp: Math.floor(Date.now() / 1000) + JWT_TTL });
  const sig = crypto.createHmac("sha256", JWT_SECRET)
    .update(`${hdr}.${pay}`).digest("base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  return `${hdr}.${pay}.${sig}`;
}

function getMemberFromRequest(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [hdr, pay, sig] = parts;
  const expected = crypto.createHmac("sha256", JWT_SECRET)
    .update(`${hdr}.${pay}`).digest("base64")
    .replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(_b64urlDec(pay));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.sub;
  } catch { return null; }
}

// ── Request body parser ───────────────────────────────────────────────────────

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// ── Response helpers ──────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

function err(res, msg, status = 400) {
  json(res, { error: msg }, status);
}

// ── API handlers ──────────────────────────────────────────────────────────────

async function handleLogin(req, res) {
  const { name, pin } = await parseBody(req);
  if (!name || !pin) return err(res, "이름과 PIN을 입력하세요.");
  const db = await loadDb();
  const member = db.members.find((m) => m.name === name);
  if (!member) return err(res, "존재하지 않는 사용자입니다.", 401);
  if (member.pin_hash !== hashPin(String(pin))) return err(res, "PIN이 올바르지 않습니다.", 401);
  const token = createToken(member.id);
  json(res, { ok: true, token, member: sanitizeMember(member) });
}

async function handleVerifyPin(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const { pin } = await parseBody(req);
  if (!pin) return err(res, "PIN을 입력하세요.");
  const db = await loadDb();
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return err(res, "사용자를 찾을 수 없습니다.", 404);
  if (member.pin_hash !== hashPin(String(pin))) return err(res, "PIN이 올바르지 않습니다.", 401);
  json(res, { ok: true });
}

async function handleChangePin(req, res) {
  const { name, old_pin, new_pin } = await parseBody(req);
  if (!name || !old_pin || !new_pin) return err(res, "이름, 현재 PIN, 새 PIN을 모두 입력하세요.");
  if (!/^\d{4,8}$/.test(String(new_pin))) return err(res, "새 PIN은 4~8자리 숫자여야 합니다.");
  const db = await loadDb();
  const idx = db.members.findIndex((m) => m.name === name);
  if (idx === -1) return err(res, "존재하지 않는 사용자입니다.", 401);
  const member = db.members[idx];
  if (member.pin_hash !== hashPin(String(old_pin))) return err(res, "현재 PIN이 올바르지 않습니다.", 401);
  member.pin_hash = hashPin(String(new_pin));
  await saveDb(db);
  json(res, { ok: true });
}

function sanitizeMember(m) {
  const { pin_hash, ...rest } = m;
  // 기본 PIN(0000) 유지 여부를 노출 (실제 해시는 숨김)
  rest.pin_is_default = (pin_hash === hashPin("0000"));
  return rest;
}

async function handleGetMembers(req, res) {
  const db = await loadDb();
  json(res, db.members.map(sanitizeMember));
}

async function handleCreateMember(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  if (!caller || caller.role !== "admin") return err(res, "권한이 없습니다.", 403);

  const { name, part, role = "member", pin = "0000", birthday, birthday_type, joined } = await parseBody(req);
  if (!name || !part) return err(res, "이름과 파트는 필수입니다.");
  if (db.members.find((m) => m.name === name)) return err(res, "이미 존재하는 이름입니다.");

  const newId = genId();
  const member = {
    id: newId,
    name,
    part,
    role,
    pin_hash: hashPin(String(pin)),
    birthday: birthday || null,
    birthday_type: birthday_type || "solar",
    joined: joined || new Date().toISOString().slice(0, 10),
  };
  db.members.push(member);

  // 생일 이벤트 자동 등록
  if (birthday) {
    upsertBirthdayEvent(db, newId, birthday, birthday_type || "solar");
  }

  await saveDb(db);
  json(res, { ok: true, member: sanitizeMember(member) });
}

async function handleUpdateMember(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  const isAdmin = caller?.role === "admin";
  const isSelf = memberId === id;
  if (!isAdmin && !isSelf) return err(res, "권한이 없습니다.", 403);

  const idx = db.members.findIndex((m) => m.id === id);
  if (idx === -1) return err(res, "사용자를 찾을 수 없습니다.", 404);

  const body = await parseBody(req);
  const member = db.members[idx];

  if (body.name && isAdmin) member.name = body.name;
  if (body.part && isAdmin) member.part = body.part;
  if (body.role && isAdmin) member.role = body.role;
  if (body.birthday !== undefined) {
    member.birthday = body.birthday;
    const bType = body.birthday_type || member.birthday_type || "solar";
    member.birthday_type = bType;
    // 생일 이벤트 upsert (생일 클리어 시 삭제)
    if (body.birthday) {
      upsertBirthdayEvent(db, id, body.birthday, bType);
    } else {
      db.events = (db.events || []).filter(
        (e) => !(e.member_id === id && e.type === "birthday")
      );
    }
  }
  if (body.joined && isAdmin) member.joined = body.joined;
  if (body.pin) member.pin_hash = hashPin(String(body.pin));

  await saveDb(db);
  json(res, { ok: true, member: sanitizeMember(member) });
}

async function handleDeleteMember(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  if (!caller || caller.role !== "admin") return err(res, "권한이 없습니다.", 403);
  if (id === "admin") return err(res, "관리자 계정은 삭제할 수 없습니다.");

  db.members = db.members.filter((m) => m.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

async function handleGetReports(req, res, url) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);

  const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : null;
  const week = url.searchParams.get("week") ? Number(url.searchParams.get("week")) : null;
  const month = url.searchParams.get("month") ? Number(url.searchParams.get("month")) : null;
  const quarter = url.searchParams.get("quarter") ? Number(url.searchParams.get("quarter")) : null;
  const part = url.searchParams.get("part") || null;
  const targetMemberId = url.searchParams.get("memberId") || null;

  const db = await loadDb();
  let reports = db.reports;

  if (year) reports = reports.filter((r) => r.year === year);
  if (week) reports = reports.filter((r) => r.week === week);
  if (month) reports = reports.filter((r) => r.month === month);
  if (quarter) reports = reports.filter((r) => Math.ceil(r.month / 3) === quarter);
  if (part) {
    const memberIds = db.members.filter((m) => m.part === part).map((m) => m.id);
    reports = reports.filter((r) => memberIds.includes(r.member_id));
  }
  if (targetMemberId) reports = reports.filter((r) => r.member_id === targetMemberId);

  // Attach member info
  const memberMap = Object.fromEntries(db.members.map((m) => [m.id, sanitizeMember(m)]));
  const enriched = reports.map((r) => ({ ...r, member: memberMap[r.member_id] || null }));

  json(res, enriched);
}

async function handleSaveReport(req, res) {
  const callerId = getMemberFromRequest(req);
  if (!callerId) return err(res, "인증이 필요합니다.", 401);

  const body = await parseBody(req);
  const { year, week, month, tasks, last_results, next_plans, note, submitted, target_member_id } = body;
  if (!year || !week) return err(res, "연도와 주차는 필수입니다.");

  const db = await loadDb();
  const caller = db.members.find((m) => m.id === callerId);
  const isAdmin  = caller?.role === "admin";
  const isLeader = caller?.role === "leader";

  // admin/leader는 target_member_id로 타인 보고서 저장 가능
  const memberId = (target_member_id && (isAdmin || isLeader)) ? target_member_id : callerId;

  // tasks (new unified format) takes priority; fall back to last_results+next_plans for backward compat
  const weekTasks = tasks !== undefined
    ? tasks
    : [...(last_results || []), ...(next_plans || [])];

  const existing = db.reports.findIndex(
    (r) => r.member_id === memberId && r.year === year && r.week === week
  );

  const now = new Date().toISOString();
  if (existing >= 0) {
    const wasSubmitted = db.reports[existing].submitted;
    const isSubmitting = submitted === true && !wasSubmitted;
    db.reports[existing] = {
      ...db.reports[existing],
      month: weekToMonth(year, week),
      tasks: weekTasks,
      last_results: [],   // deprecated — cleared on re-save
      next_plans: [],     // deprecated — cleared on re-save
      note: note || "",
      updated_at: now,
      ...(submitted !== undefined && { submitted: Boolean(submitted) }),
      ...(isSubmitting && { submitted_at: now }),
    };
    await saveDb(db);
    json(res, { ok: true, report: db.reports[existing] });
  } else {
    const isSubmitting = submitted === true;
    const report = {
      id: genId(),
      member_id: memberId,
      year,
      week,
      month: weekToMonth(year, week),
      tasks: weekTasks,
      last_results: [],
      next_plans: [],
      note: note || "",
      submitted: isSubmitting,
      submitted_at: isSubmitting ? now : null,
      updated_at: now,
    };
    db.reports.push(report);
    await saveDb(db);
    json(res, { ok: true, report });
  }
}

/* ── Personal task handlers ──────────────────────────────────────────────── */

async function handleGetTasks(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const url = new URL(req.url, "http://x");
  const targetId = url.searchParams.get("target_member_id");
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  // 파트장/팀장은 타인 업무 조회 가능 (파트장은 동일 파트만)
  let queryId = memberId;
  if (targetId && targetId !== memberId) {
    if (caller?.role === "admin") {
      queryId = targetId;
    } else if (caller?.role === "leader") {
      const target = db.members.find((m) => m.id === targetId);
      if (target && target.part === caller.part) queryId = targetId;
    }
  }
  const items = (db.tasks || []).filter((t) => t.member_id === queryId);
  json(res, items.sort((a, b) => {
    const order = { in_progress: 0, waiting: 1, done: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  }));
}

async function handleCreateTask(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const body = await parseBody(req);
  const { title, cat1 = "", category = "", status = "in_progress", priority = "normal", due_date = null, note = "", subtasks = [], cycle = "", cycle_day = null, cycle_month = null, holiday_adjust = "none", target_member_id } = body;
  if (!title) return err(res, "업무명은 필수입니다.");
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  // 파트장/팀장은 타인을 위해 업무 추가 가능 (파트장은 동일 파트만)
  let ownerId = memberId;
  if (target_member_id && target_member_id !== memberId) {
    if (caller?.role === "admin") {
      ownerId = target_member_id;
    } else if (caller?.role === "leader") {
      const target = db.members.find((m) => m.id === target_member_id);
      if (target && target.part === caller.part) ownerId = target_member_id;
    }
  }
  if (!db.tasks) db.tasks = [];
  const now = new Date().toISOString();
  const task = { id: genId(), member_id: ownerId, cat1, title, category, status, priority, due_date, note, subtasks, cycle, cycle_day, cycle_month, holiday_adjust, created_at: now, updated_at: now };
  db.tasks.push(task);
  await saveDb(db);
  json(res, { ok: true, task });
}

async function handleUpdateTask(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  if (!db.tasks) return err(res, "찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return err(res, "찾을 수 없습니다.", 404);
  // 파트장은 동일 파트 팀원 업무만 수정 가능, 팀장은 전체 수정 가능
  let canEdit = task.member_id === memberId || caller?.role === "admin";
  if (!canEdit && caller?.role === "leader") {
    const taskOwner = db.members.find((m) => m.id === task.member_id);
    canEdit = taskOwner?.part === caller.part;
  }
  if (!canEdit) return err(res, "권한이 없습니다.", 403);
  const body = await parseBody(req);
  ["title","cat1","category","status","priority","due_date","note","subtasks","cycle","cycle_day","cycle_month","holiday_adjust"].forEach((k) => { if (body[k] !== undefined) task[k] = body[k]; });
  task.updated_at = new Date().toISOString();
  await saveDb(db);
  json(res, { ok: true, task });
}

async function handleDeleteTask(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  if (!db.tasks) return err(res, "찾을 수 없습니다.", 404);
  const task = db.tasks.find((t) => t.id === id);
  if (!task) return err(res, "찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  // 파트장은 동일 파트 팀원 업무만 삭제 가능
  let canDelete = task.member_id === memberId || caller?.role === "admin";
  if (!canDelete && caller?.role === "leader") {
    const taskOwner = db.members.find((m) => m.id === task.member_id);
    canDelete = taskOwner?.part === caller.part;
  }
  if (!canDelete) return err(res, "권한이 없습니다.", 403);
  db.tasks = db.tasks.filter((t) => t.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

/* ── Recurring task handlers ─────────────────────────────────────────────── */

async function handleGetRecurring(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const items = (db.recurring || []).filter((r) => r.member_id === memberId);
  json(res, items);
}

async function handleCreateRecurring(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const body = await parseBody(req);
  const { text, recurrence_type, recurrence_day, holiday_adjust = "after", note = "", category = "" } = body;
  if (!text || !recurrence_type || recurrence_day === undefined) {
    return err(res, "업무 내용, 반복 유형, 반복 일자는 필수입니다.");
  }
  const db = await loadDb();
  if (!db.recurring) db.recurring = [];
  const item = {
    id: genId(),
    member_id: memberId,
    text,
    category,
    recurrence_type,
    recurrence_day: Number(recurrence_day),
    holiday_adjust,
    note,
    enabled: true,
    created_at: new Date().toISOString(),
  };
  db.recurring.push(item);
  await saveDb(db);
  json(res, { ok: true, item });
}

async function handleUpdateRecurring(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  if (!db.recurring) return err(res, "찾을 수 없습니다.", 404);
  const idx = db.recurring.findIndex((r) => r.id === id);
  if (idx === -1) return err(res, "찾을 수 없습니다.", 404);
  if (db.recurring[idx].member_id !== memberId) return err(res, "권한이 없습니다.", 403);
  const body = await parseBody(req);
  const item = db.recurring[idx];
  if (body.text !== undefined) item.text = body.text;
  if (body.category !== undefined) item.category = body.category;
  if (body.recurrence_type !== undefined) item.recurrence_type = body.recurrence_type;
  if (body.recurrence_day !== undefined) item.recurrence_day = Number(body.recurrence_day);
  if (body.holiday_adjust !== undefined) item.holiday_adjust = body.holiday_adjust;
  if (body.note !== undefined) item.note = body.note;
  if (body.enabled !== undefined) item.enabled = Boolean(body.enabled);
  await saveDb(db);
  json(res, { ok: true, item });
}

async function handleDeleteRecurring(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  if (!db.recurring) return err(res, "찾을 수 없습니다.", 404);
  const item = db.recurring.find((r) => r.id === id);
  if (!item) return err(res, "찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  if (item.member_id !== memberId && caller?.role !== "admin") return err(res, "권한이 없습니다.", 403);
  db.recurring = db.recurring.filter((r) => r.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

async function handleDeleteReport(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const report = db.reports.find((r) => r.id === id);
  if (!report) return err(res, "보고서를 찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  if (report.member_id !== memberId && caller?.role !== "admin") return err(res, "권한이 없습니다.", 403);
  db.reports = db.reports.filter((r) => r.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

// ── Feedback handlers ─────────────────────────────────────────────────────────

async function handleGetFeedbacks(req, res, url) {
  const callerId = getMemberFromRequest(req);
  if (!callerId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const feedbacks = db.feedbacks || [];

  let filtered = feedbacks;
  const targetId = url.searchParams.get("target_id");
  const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : null;
  const periodType = url.searchParams.get("period_type");
  const periodValue = url.searchParams.get("period_value") !== null ? Number(url.searchParams.get("period_value")) : null;

  if (targetId) filtered = filtered.filter((f) => f.target_member_id === targetId);
  if (year) filtered = filtered.filter((f) => f.year === year);
  if (periodType) filtered = filtered.filter((f) => f.period_type === periodType);
  if (periodValue !== null) filtered = filtered.filter((f) => f.period_value === periodValue);

  const memberMap = Object.fromEntries(db.members.map((m) => [m.id, sanitizeMember(m)]));
  const enriched = filtered.map((f) => ({
    ...f,
    author: memberMap[f.author_id] || null,
    target: memberMap[f.target_member_id] || null,
  }));
  json(res, enriched);
}

async function handleCreateFeedback(req, res) {
  const callerId = getMemberFromRequest(req);
  if (!callerId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === callerId);
  if (!caller || (caller.role !== "admin" && caller.role !== "leader"))
    return err(res, "파트장 또는 관리자만 피드백을 작성할 수 있습니다.", 403);

  const { target_member_id, year, period_type, period_value, text } = await parseBody(req);
  if (!target_member_id || !year || !period_type || !text?.trim())
    return err(res, "필수 항목이 누락됐습니다.");

  if (!db.feedbacks) db.feedbacks = [];
  const fb = {
    id: genId(),
    author_id: callerId,
    target_member_id,
    year: Number(year),
    period_type,
    period_value: period_value !== undefined ? Number(period_value) : 0,
    text: text.trim(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.feedbacks.push(fb);
  await saveDb(db);
  const memberMap = Object.fromEntries(db.members.map((m) => [m.id, sanitizeMember(m)]));
  json(res, { ok: true, feedback: { ...fb, author: memberMap[callerId], target: memberMap[target_member_id] } });
}

async function handleDeleteFeedback(req, res, id) {
  const callerId = getMemberFromRequest(req);
  if (!callerId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  if (!db.feedbacks) return err(res, "피드백을 찾을 수 없습니다.", 404);
  const fb = db.feedbacks.find((f) => f.id === id);
  if (!fb) return err(res, "피드백을 찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === callerId);
  if (fb.author_id !== callerId && caller?.role !== "admin")
    return err(res, "권한이 없습니다.", 403);
  db.feedbacks = db.feedbacks.filter((f) => f.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

async function handleGetEvents(req, res, url) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const db = await loadDb();
  let events = db.events;

  // Regular date-range filter
  let rangeEvents = events;
  if (start) rangeEvents = rangeEvents.filter((e) => e.end_date >= start);
  if (end) rangeEvents = rangeEvents.filter((e) => e.start_date <= end);

  // Also include yearly-repeat events that match this month (from any year)
  if (start && end) {
    const startMD = start.slice(5);
    const endMD = end.slice(5);
    const yearPrefix = start.slice(0, 4);
    const targetYear = Number(yearPrefix);

    // 양력 반복 (yearly)
    const solarExtra = events.filter((e) => {
      if (e.repeat !== "yearly") return false;
      if (rangeEvents.find((r) => r.id === e.id)) return false;
      const eMD = e.start_date.slice(5);
      return eMD >= startMD && eMD <= endMD;
    }).map((e) => ({
      ...e,
      start_date: `${yearPrefix}-${e.start_date.slice(5)}`,
      end_date: `${yearPrefix}-${e.end_date.slice(5)}`,
      isYearlyRepeat: true,
    }));

    // 음력 반복 (yearly_lunar) — 음력 날짜를 해당 연도 양력으로 변환
    const lunarExtra = [];
    for (const e of events) {
      if (e.repeat !== "yearly_lunar") continue;
      if (rangeEvents.find((r) => r.id === e.id)) continue;
      const solarDate = lunarToSolar(targetYear, e.start_date, e.lunar_month, e.lunar_day);
      if (!solarDate) continue;
      const sMD = solarDate.slice(5);
      if (sMD >= startMD && sMD <= endMD) {
        lunarExtra.push({
          ...e,
          start_date: solarDate,
          end_date: solarDate,
          isYearlyRepeat: true,
          isLunar: true,
        });
      }
    }

    rangeEvents = [...rangeEvents, ...solarExtra, ...lunarExtra];
  }

  const memberMap = Object.fromEntries(db.members.map((m) => [m.id, sanitizeMember(m)]));
  const enriched = rangeEvents.map((e) => ({ ...e, member: memberMap[e.member_id] || null }));
  json(res, enriched);
}

async function handleCreateEvent(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const body = await parseBody(req);
  const { type, start_date, end_date, note, target_member_id, repeat } = body;
  if (!type || !start_date) return err(res, "유형과 시작일은 필수입니다.");

  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  const ownerId = target_member_id && caller?.role === "admin" ? target_member_id : memberId;

  // 음력 반복인 경우: 입력한 날짜의 월/일을 음력으로 해석하고 양력으로 변환해서 저장
  let lunarMonth = null, lunarDay = null;
  let actualStartDate = start_date;
  let actualEndDate = end_date || start_date;

  if (repeat === "yearly_lunar") {
    const parts = start_date.split("-");
    const inputYear = parseInt(parts[0], 10);
    lunarMonth = parseInt(parts[1], 10);   // 입력 날짜의 월 → 음력 월로 해석
    lunarDay   = parseInt(parts[2], 10);   // 입력 날짜의 일 → 음력 일로 해석

    // 해당 연도에서 음력 → 양력 변환
    const solarDate = lunarToSolar(inputYear, start_date, lunarMonth, lunarDay);
    if (solarDate) {
      actualStartDate = solarDate;
      actualEndDate   = solarDate;
    }
  }

  const event = {
    id: genId(),
    member_id: ownerId,
    type,
    start_date: actualStartDate,
    end_date: actualEndDate,
    note: note || "",
    repeat: repeat || null,
    ...(lunarMonth && lunarDay ? { lunar_month: lunarMonth, lunar_day: lunarDay } : {}),
    created_at: new Date().toISOString(),
  };
  db.events.push(event);
  await saveDb(db);
  json(res, { ok: true, event });
}

async function handleUpdateEvent(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx === -1) return err(res, "이벤트를 찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  if (db.events[idx].member_id !== memberId && caller?.role !== "admin") return err(res, "권한이 없습니다.", 403);
  const body = await parseBody(req);
  const e = db.events[idx];
  if (body.type) e.type = body.type;
  if (body.start_date) e.start_date = body.start_date;
  if (body.end_date) e.end_date = body.end_date;
  if (body.note !== undefined) e.note = body.note;
  await saveDb(db);
  json(res, { ok: true, event: e });
}

async function handleDeleteEvent(req, res, id) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const event = db.events.find((e) => e.id === id);
  if (!event) return err(res, "이벤트를 찾을 수 없습니다.", 404);
  const caller = db.members.find((m) => m.id === memberId);
  if (event.member_id !== memberId && caller?.role !== "admin") return err(res, "권한이 없습니다.", 403);
  db.events = db.events.filter((e) => e.id !== id);
  await saveDb(db);
  json(res, { ok: true });
}

async function handleGetCompilation(req, res, url) {
  const db = await loadDb();
  const week = url.searchParams.get("week") || "";
  if (!db.compilation) db.compilation = {};
  const stored = db.compilation[week];
  // 구버전 호환: 배열로 저장된 경우 { items, order } 형식으로 변환
  if (Array.isArray(stored)) {
    json(res, { week, items: stored, order: {} });
  } else {
    json(res, { week, items: stored?.items || [], order: stored?.order || {} });
  }
}

async function handleSaveCompilation(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const body = await parseBody(req);
  const { week, items, order } = body;
  if (!week) return err(res, "week 필드는 필수입니다.");
  const db = await loadDb();
  if (!db.compilation) db.compilation = {};
  // order 포함해서 저장 (없으면 기존 order 유지)
  const prev = db.compilation[week];
  const prevOrder = Array.isArray(prev) ? {} : (prev?.order || {});
  db.compilation[week] = { items: items || [], order: order !== undefined ? order : prevOrder };
  await saveDb(db);
  json(res, { ok: true });
}

async function handleGetCategories(req, res) {
  const db = await loadDb();
  json(res, db.categories || {});
}

async function handleGetCatPriority(req, res) {
  const db = await loadDb();
  json(res, db.catPriority || {});
}

async function handleSaveCatPriority(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  if (caller?.role !== "admin") return err(res, "관리자 권한이 필요합니다.", 403);
  const body = await parseBody(req);
  db.catPriority = body; // { "파트명": ["cat1", "cat1", ...], ... }
  await saveDb(db);
  json(res, { ok: true });
}

async function handleUpdateCategories(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const caller = db.members.find((m) => m.id === memberId);
  if (caller?.role !== "admin") return err(res, "관리자 권한이 필요합니다.", 403);
  const body = await parseBody(req);
  db.categories = body;
  await saveDb(db);
  json(res, { ok: true, categories: db.categories });
}

async function handleGetMe(req, res) {
  const memberId = getMemberFromRequest(req);
  if (!memberId) return err(res, "인증이 필요합니다.", 401);
  const db = await loadDb();
  const member = db.members.find((m) => m.id === memberId);
  if (!member) return err(res, "사용자를 찾을 수 없습니다.", 404);
  json(res, sanitizeMember(member));
}

// ── Static file server ────────────────────────────────────────────────────────

async function serveStatic(pathname, res) {
  try {
    const filePath = join(PUBLIC, pathname === "/" ? "index.html" : pathname);
    const ext = extname(filePath) || ".html";
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    const data = await readFile(join(PUBLIC, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  // API 요청만 카운팅 (정적 파일 제외)
  const isApiReq = req.url.startsWith("/api");
  if (isApiReq) {
    activeApiConnections++;
    let counted = true;
    const dec = () => { if (counted) { counted = false; activeApiConnections = Math.max(0, activeApiConnections - 1); } };
    res.on("finish", dec);
    res.on("close", dec);
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method;

    // 서버 상태 조회 (인증 불필요)
    if (path === "/api/status" && method === "GET") {
      const busy = activeApiConnections > MAX_API_CONNECTIONS;
      return json(res, {
        active: activeApiConnections,
        capacity: MAX_API_CONNECTIONS,
        busy,
        message: busy ? "현재 접속자가 많습니다. 잠시 후 자동으로 연결됩니다." : "정상",
      });
    }

    if (path === "/api/login" && method === "POST") return handleLogin(req, res);
    if (path === "/api/change-pin" && method === "POST") return handleChangePin(req, res);
    if (path === "/api/verify-pin" && method === "POST") return handleVerifyPin(req, res);
    if (path === "/api/me" && method === "GET") return handleGetMe(req, res);

    if (path === "/api/feedbacks" && method === "GET") return handleGetFeedbacks(req, res, url);
    if (path === "/api/feedbacks" && method === "POST") return handleCreateFeedback(req, res);
    const feedbackMatch = path.match(/^\/api\/feedbacks\/([^/]+)$/);
    if (feedbackMatch && method === "DELETE") return handleDeleteFeedback(req, res, feedbackMatch[1]);

    if (path === "/api/members" && method === "GET") return handleGetMembers(req, res);
    if (path === "/api/members" && method === "POST") return handleCreateMember(req, res);

    const memberMatch = path.match(/^\/api\/members\/([^/]+)$/);
    if (memberMatch) {
      if (method === "PUT") return handleUpdateMember(req, res, memberMatch[1]);
      if (method === "DELETE") return handleDeleteMember(req, res, memberMatch[1]);
    }

    if (path === "/api/reports" && method === "GET") return handleGetReports(req, res, url);
    if (path === "/api/reports" && method === "POST") return handleSaveReport(req, res);

    const reportMatch = path.match(/^\/api\/reports\/([^/]+)$/);
    if (reportMatch && method === "DELETE") return handleDeleteReport(req, res, reportMatch[1]);

    if (path === "/api/events" && method === "GET") return handleGetEvents(req, res, url);
    if (path === "/api/events" && method === "POST") return handleCreateEvent(req, res);

    const eventMatch = path.match(/^\/api\/events\/([^/]+)$/);
    if (eventMatch) {
      if (method === "PUT") return handleUpdateEvent(req, res, eventMatch[1]);
      if (method === "DELETE") return handleDeleteEvent(req, res, eventMatch[1]);
    }

    if (path === "/api/tasks" && method === "GET") return handleGetTasks(req, res);
    if (path === "/api/tasks" && method === "POST") return handleCreateTask(req, res);
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      if (method === "PUT") return handleUpdateTask(req, res, taskMatch[1]);
      if (method === "DELETE") return handleDeleteTask(req, res, taskMatch[1]);
    }

    if (path === "/api/compilation" && method === "GET") return handleGetCompilation(req, res, url);
    if (path === "/api/compilation" && method === "PUT") return handleSaveCompilation(req, res);

    if (path === "/api/categories" && method === "GET") return handleGetCategories(req, res);
    if (path === "/api/categories" && method === "PUT") return handleUpdateCategories(req, res);

    if (path === "/api/cat-priority" && method === "GET") return handleGetCatPriority(req, res);
    if (path === "/api/cat-priority" && method === "PUT") return handleSaveCatPriority(req, res);

    // 기존 보고서 month 필드를 year+week 기준으로 일괄 수정 (admin 전용)
    if (path === "/api/fix-report-months" && method === "POST") {
      const callerId = getMemberFromRequest(req);
      if (!callerId) return err(res, "인증이 필요합니다.", 401);
      const db = await loadDb();
      const caller = db.members.find((m) => m.id === callerId);
      if (caller?.role !== "admin") return err(res, "관리자만 사용 가능합니다.", 403);
      let fixed = 0;
      db.reports.forEach((r) => {
        const correct = weekToMonth(r.year, r.week);
        if (r.month !== correct) { r.month = correct; fixed++; }
      });
      await saveDb(db);
      return json(res, { ok: true, fixed });
    }

    if (path === "/api/recurring" && method === "GET") return handleGetRecurring(req, res, url);
    if (path === "/api/recurring" && method === "POST") return handleCreateRecurring(req, res);

    const recurringMatch = path.match(/^\/api\/recurring\/([^/]+)$/);
    if (recurringMatch) {
      if (method === "PUT") return handleUpdateRecurring(req, res, recurringMatch[1]);
      if (method === "DELETE") return handleDeleteRecurring(req, res, recurringMatch[1]);
    }

    if (!path.startsWith("/api")) return serveStatic(path, res);

    err(res, "Not found", 404);
  } catch (e) {
    console.error(e);
    err(res, e.message || "서버 오류", 500);
  }
}

await ensureDefaultData();

if (!process.env.VERCEL) {
  const server = createServer(handler);
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`경영지원팀 스마트 스케줄러 → http://127.0.0.1:${PORT}`);
  });
}

export default handler;
