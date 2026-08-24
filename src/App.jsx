import { useState, useEffect, useMemo, useRef } from "react";

/* ------------------------------------------------------------------ */
/*  Serve Target — opponent serve receive                             */
/*                                                                     */
/*  Color = pass quality, always:                                      */
/*     RED = ace, ORANGE = 1, YELLOW = 2, GREEN = 3.                   */
/*  A red passer is the one you serve. Chrome is blue.                 */
/*                                                                     */
/*  Data lives in localStorage on this device. The live match is       */
/*  flushed on a short timer and again when the page hides, so a       */
/*  screen lock or app switch never loses taps. Export CSVs after      */
/*  matches — the device is the working copy, not the archive.         */
/* ------------------------------------------------------------------ */

const APP_VERSION = "1.5.0";
const MIN_N = 4;
const CUR_KEY = "servetarget:current";
const ARCHIVE_KEY = "servetarget:archive";
const FLUSH_MS = 1500;

const RATINGS = [
  { id: "ace", label: "ACE", sub: "NO PASS", text: "text-red-500", fill: "active:bg-red-600" },
  { id: 1, label: "1", sub: "BROKEN", text: "text-orange-400", fill: "active:bg-orange-500" },
  { id: 2, label: "2", sub: "PLAYABLE", text: "text-amber-300", fill: "active:bg-amber-400" },
  { id: 3, label: "3", sub: "PERFECT", text: "text-green-400", fill: "active:bg-green-500" },
];

const SEGMENTS = [
  ["ace", "ACE", "bg-red-600", "text-white"],
  [1, "1", "bg-orange-500", "text-white"],
  [2, "2", "bg-amber-300", "text-slate-900"],
  [3, "3", "bg-green-500", "text-slate-900"],
];

const val = (r) => (r === "ace" ? 0 : r);
const fmt = (v) => (v === null || v === undefined ? "—" : v.toFixed(2));

const avgColor = (a, n) => {
  if (n < MIN_N) return "text-slate-400";
  if (a <= 1.9) return "text-red-500";
  if (a <= 2.35) return "text-amber-300";
  return "text-green-400";
};

const breakColor = (pct, n) => {
  if (n < MIN_N) return "text-slate-400";
  if (pct >= 30) return "text-green-400";
  if (pct >= 18) return "text-amber-300";
  return "text-red-500";
};

function summarize(list) {
  const passes = list.filter((s) => s.rating !== "err");
  const errs = list.filter((s) => s.rating === "err").length;
  const counts = { ace: 0, 1: 0, 2: 0, 3: 0 };
  passes.forEach((s) => (counts[s.rating] += 1));
  if (!passes.length) return { n: 0, avg: null, errs, total: list.length, counts, breakPct: null };
  const n = passes.length;
  return {
    n,
    avg: passes.reduce((a, s) => a + val(s.rating), 0) / n,
    errs,
    total: list.length,
    counts,
    breakPct: Math.round(((counts.ace + counts[1]) / n) * 100),
  };
}

const statsFor = (serves, jerseys) =>
  jerseys
    .map((j) => ({ jersey: j, ...summarize(serves.filter((s) => s.passer === j)) }))
    .filter((p) => p.n > 0)
    .sort((a, b) => a.avg - b.avg);

const prettyDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/* --------------------------- storage ----------------------------- */

function hasStorage() {
  try {
    localStorage.setItem("__servetarget_test", "1");
    localStorage.removeItem("__servetarget_test");
    return true;
  } catch {
    return false;
  }
}

function readKey(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeKey(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

/* ---------------------------- export ----------------------------- */

function tryDownload(text, filename, type = "text/csv;charset=utf-8") {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}

function ExportSheet({ title, filename, text, onClose }) {
  const [msg, setMsg] = useState("");
  const ref = useRef(null);

  return (
    <div className="fixed inset-0 bg-slate-950 bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-900 ring-1 ring-slate-700 rounded-lg p-5 flex flex-col max-h-full">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold">{title}</p>
          <button onClick={onClose} className="text-slate-400 text-sm tracking-[0.2em] font-bold px-2">
            CLOSE
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          {text.split("\n").length - 1} rows. Copy it into an email to yourself, or try the download.
        </p>

        <textarea
          ref={ref}
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-h-[12rem] w-full bg-slate-950 ring-1 ring-slate-700 rounded p-3 font-mono text-xs text-slate-300 mb-3 resize-none"
        />

        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={async () => {
              const ok = await copyText(text);
              if (ok) setMsg("Copied to the clipboard.");
              else {
                if (ref.current) {
                  ref.current.focus();
                  ref.current.select();
                }
                setMsg("Couldn't copy automatically — it's selected, use Copy from the menu.");
              }
            }}
            className="rounded bg-blue-600 font-black tracking-wide px-6 py-3 active:bg-blue-500"
          >
            COPY ALL
          </button>
          <button
            onClick={() => setMsg(tryDownload(text, filename) ? "Download started — check your Files app." : "Download is blocked here. Use Copy All instead.")}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
          >
            TRY DOWNLOAD
          </button>
          {msg && <p className="text-slate-400 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------ shareable image ------------------------ */

const HEX = {
  bg: "#0f172a", panel: "#020617", white: "#ffffff",
  slate400: "#94a3b8", slate500: "#64748b", slate700: "#334155", slate800: "#1e293b",
  red500: "#ef4444", red600: "#dc2626", orange500: "#f97316", amber300: "#fcd34d",
  green400: "#4ade80", green500: "#22c55e", blue400: "#60a5fa",
};
const avgHex = (a, n) => (n < MIN_N ? HEX.slate400 : a <= 1.9 ? HEX.red500 : a <= 2.35 ? HEX.amber300 : HEX.green400);
const SEG_HEX = { ace: [HEX.red600, "#ffffff"], 1: [HEX.orange500, "#ffffff"], 2: [HEX.amber300, "#0f172a"], 3: [HEX.green500, "#0f172a"] };

function buildReportImage({ title, subtitle, stats, totalPassed, targetJersey }) {
  const W = 1400;
  const rowH = 108, gap = 14, top = 210, bottom = 80;
  const H = top + stats.length * (rowH + gap) - (stats.length ? gap : 0) + bottom;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const font = (w, s) => (ctx.font = `${w} ${s}px -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif`);
  const rr = (x, y, w, h, r) => {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else ctx.fillRect(x, y, w, h);
  };

  ctx.fillStyle = HEX.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = HEX.blue400;
  font(700, 22);
  ctx.fillText("S E R V E   T A R G E T", 48, 60);
  ctx.fillStyle = HEX.white;
  font(900, 58);
  ctx.fillText(title.length > 32 ? title.slice(0, 31) + "…" : title, 44, 126);
  ctx.fillStyle = HEX.slate400;
  font(600, 26);
  ctx.fillText(subtitle, 46, 168);

  const legend = [["3", "PERFECT"], ["2", "PLAYABLE"], ["1", "BROKEN"], ["ace", "ACE"]];
  let lx = W - 48;
  font(700, 22);
  legend.forEach(([k]) => {
    const label = k === "ace" ? "ACE" : k;
    const tw = ctx.measureText(label).width;
    lx -= tw;
    ctx.fillStyle = HEX.slate400;
    ctx.fillText(label, lx, 62);
    lx -= 34;
    ctx.fillStyle = SEG_HEX[k][0];
    rr(lx, 42, 24, 24, 5);
    lx -= 28;
  });

  stats.forEach((p, i) => {
    const y = top + i * (rowH + gap);
    const isTarget = targetJersey === p.jersey;
    ctx.fillStyle = HEX.panel;
    rr(40, y, W - 80, rowH, 12);
    if (isTarget) {
      ctx.strokeStyle = HEX.white;
      ctx.lineWidth = 4;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(42, y + 2, W - 84, rowH - 4, 11);
        ctx.stroke();
      } else ctx.strokeRect(42, y + 2, W - 84, rowH - 4);
    }

    ctx.fillStyle = HEX.white;
    font(900, 62);
    ctx.textAlign = "center";
    ctx.fillText(p.jersey, 130, y + (isTarget ? 62 : 72));
    if (isTarget) {
      ctx.fillStyle = HEX.red600;
      rr(85, y + 74, 90, 26, 6);
      ctx.fillStyle = HEX.white;
      font(900, 17);
      ctx.fillText("TARGET", 130, y + 93);
    }
    ctx.textAlign = "left";

    ctx.fillStyle = avgHex(p.avg, p.n);
    font(900, 58);
    ctx.fillText(fmt(p.avg), 220, y + 66);
    ctx.fillStyle = HEX.slate500;
    font(600, 22);
    const share = totalPassed ? Math.round((p.n / totalPassed) * 100) : 0;
    ctx.fillText(`${p.n} passes · ${share}% of serves${p.n < MIN_N ? " · thin" : ""}`, 222, y + 96);

    const bx = 480, bw = W - bx - 70, by = y + 26, bh = 56;
    ctx.fillStyle = HEX.slate800;
    rr(bx, by, bw, bh, 8);
    let sx = bx;
    ["ace", 1, 2, 3].forEach((k) => {
      if (!p.counts[k]) return;
      const w = (p.counts[k] / p.n) * bw;
      ctx.fillStyle = SEG_HEX[k][0];
      ctx.fillRect(sx, by, w, bh);
      if (w >= 36) {
        ctx.fillStyle = SEG_HEX[k][1];
        font(900, 26);
        ctx.textAlign = "center";
        ctx.fillText(String(p.counts[k]), sx + w / 2, by + 37);
        ctx.textAlign = "left";
      }
      sx += w;
    });
  });

  ctx.fillStyle = HEX.slate700;
  font(600, 20);
  ctx.fillText("Worst passer at the top — red average = your serving target.", 48, H - 34);

  return cv;
}

function ImageSheet({ dataUrl, blob, filename, onClose }) {
  const [msg, setMsg] = useState("");
  const file = blob ? new File([blob], filename, { type: "image/png" }) : null;
  const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));

  return (
    <div className="fixed inset-0 bg-slate-950 bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-slate-900 ring-1 ring-slate-700 rounded-lg p-5 flex flex-col max-h-full">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold">SHARE THIS REPORT</p>
          <button onClick={onClose} className="text-slate-400 text-sm tracking-[0.2em] font-bold px-2">
            CLOSE
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          Press and hold the image, then <span className="text-white font-bold">Save to Photos</span> or <span className="text-white font-bold">Share</span> — or use the buttons below.
        </p>

        <div className="flex-1 min-h-0 overflow-auto mb-3">
          <img src={dataUrl} alt="Passer report" className="w-full rounded ring-1 ring-slate-700" />
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {canShare && (
            <button
              onClick={async () => {
                try {
                  await navigator.share({ files: [file] });
                } catch {
                  /* user cancelled the share sheet */
                }
              }}
              className="rounded bg-blue-600 font-black tracking-wide px-6 py-3 active:bg-blue-500"
            >
              SHARE / SAVE…
            </button>
          )}
          <button
            onClick={() => {
              try {
                const a = document.createElement("a");
                a.href = dataUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setMsg("Download started.");
              } catch {
                setMsg("Download blocked here — press and hold the image instead.");
              }
            }}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
          >
            DOWNLOAD
          </button>
          {msg && <p className="text-slate-400 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------ backup & restore ----------------------- */

function BackupSheet({ text, filename, onClose }) {
  const [msg, setMsg] = useState("");
  const file = new File([text], filename, { type: "application/json" });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));

  return (
    <div className="fixed inset-0 bg-slate-950 bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 ring-1 ring-slate-700 rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold">BACKUP EVERYTHING</p>
          <button onClick={onClose} className="text-slate-400 text-sm tracking-[0.2em] font-bold px-2">
            CLOSE
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          One file with every saved match and scout. AirDrop it to the other iPad or email it to yourself, then use <span className="text-white font-bold">RESTORE</span> on that device — it adds what's missing and never wipes anything.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          {canShare && (
            <button
              onClick={async () => {
                try {
                  await navigator.share({ files: [file] });
                } catch {
                  /* user cancelled */
                }
              }}
              className="rounded bg-blue-600 font-black tracking-wide px-6 py-3 active:bg-blue-500"
            >
              SHARE FILE…
            </button>
          )}
          <button
            onClick={() => setMsg(tryDownload(text, filename, "application/json") ? "Download started — check your Files app." : "Download blocked — use Copy All.")}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
          >
            DOWNLOAD
          </button>
          <button
            onClick={async () => setMsg((await copyText(text)) ? "Copied — paste it into an email or note." : "Couldn't copy here — use Download.")}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
          >
            COPY ALL
          </button>
        </div>
        {msg && <p className="text-slate-400 text-sm mt-3">{msg}</p>}
      </div>
    </div>
  );
}

function RestoreSheet({ onRestore, onClose }) {
  const [msg, setMsg] = useState("");
  const [buf, setBuf] = useState("");

  return (
    <div className="fixed inset-0 bg-slate-950 bg-opacity-95 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-slate-900 ring-1 ring-slate-700 rounded-lg p-5 flex flex-col max-h-full">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold">RESTORE FROM BACKUP</p>
          <button onClick={onClose} className="text-slate-400 text-sm tracking-[0.2em] font-bold px-2">
            CLOSE
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Pick a backup file, or paste one you copied. Matches get <span className="text-white font-bold">added</span> to what's on this device — nothing here gets deleted or overwritten.
        </p>
        <label className="rounded bg-blue-600 font-black tracking-wide px-6 py-3 active:bg-blue-500 text-center cursor-pointer mb-3">
          CHOOSE BACKUP FILE
          <input
            type="file"
            accept=".json,application/json,.txt,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files && e.target.files[0];
              if (!f) return;
              try {
                setMsg(onRestore(await f.text()));
              } catch {
                setMsg("Couldn't read that file.");
              }
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          value={buf}
          onChange={(e) => setBuf(e.target.value)}
          placeholder='Or paste the backup text here — it starts with {"app":"serve-target"…'
          className="w-full min-h-[6rem] bg-slate-950 ring-1 ring-slate-700 rounded p-3 font-mono text-xs text-slate-300 mb-3 resize-none"
        />
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => buf.trim() && setMsg(onRestore(buf))}
            disabled={!buf.trim()}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700 disabled:opacity-30"
          >
            RESTORE PASTED TEXT
          </button>
          {msg && <p className="text-slate-400 text-sm">{msg}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------- number keypad ------------------------- */

function Keypad({ title, hint, chips, onAdd, onRemove, onClose, onPick, pickMode }) {
  const [buf, setBuf] = useState("");
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 ring-1 ring-slate-700 rounded-lg p-5">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold">{title}</p>
          <button onClick={onClose} className="text-slate-400 text-sm tracking-[0.2em] font-bold px-2">
            DONE
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">{hint}</p>

        <div className="flex flex-wrap gap-2 mb-4 min-h-[3.5rem]">
          {chips.length === 0 && <p className="text-slate-600 self-center">None yet.</p>}
          {chips.map((j) => (
            <button
              key={j}
              onClick={() => (pickMode ? onPick(j) : onRemove(j))}
              className="h-14 min-w-[4rem] px-4 rounded text-2xl font-black font-mono bg-slate-800 ring-1 ring-slate-600 text-white active:bg-blue-600"
            >
              {j}
              {!pickMode && <span className="text-slate-500 text-sm ml-1">×</span>}
            </button>
          ))}
        </div>

        <div className="bg-slate-800 ring-2 ring-blue-500 h-16 rounded flex items-center px-4 mb-3">
          <span className="text-4xl font-black font-mono text-blue-400">{buf || <span className="text-slate-600">–</span>}</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {keys.map((k) => (
            <button key={k} onClick={() => setBuf((b) => (b.length < 2 ? b + k : b))} className="h-16 rounded bg-slate-800 ring-1 ring-slate-600 text-2xl font-black font-mono text-white active:bg-slate-700">
              {k}
            </button>
          ))}
          <button onClick={() => setBuf((b) => b.slice(0, -1))} className="h-16 col-span-2 rounded bg-slate-800 ring-1 ring-slate-600 text-slate-400 font-black tracking-wide active:bg-slate-700">
            DELETE
          </button>
          <button
            onClick={() => {
              if (!buf) return;
              onAdd(buf);
              if (pickMode) onPick(buf);
              setBuf("");
            }}
            className="h-16 col-span-3 rounded bg-blue-600 text-white font-black tracking-wide active:bg-blue-500"
          >
            {pickMode ? "USE THIS NUMBER" : "ADD NUMBER"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------- shared passer report ---------------------- */

function PasserReport({ serves, receivers, servers, targetJersey, note }) {
  const stats = statsFor(serves, receivers);
  const totalPassed = serves.filter((s) => s.rating !== "err").length;
  const srv = servers
    .map((j) => ({ jersey: j, ...summarize(serves.filter((s) => s.server === j)) }))
    .filter((p) => p.total > 0)
    .sort((a, b) => (b.breakPct ?? -1) - (a.breakPct ?? -1));

  return (
    <>
      <div className="p-4">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
          <div>
            <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold">THEIR PASSERS — WORST AT THE TOP</p>
            <p className="text-slate-500 text-xs">{note || "Red is a passer breaking down. Green is one handling everything."}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[10px] tracking-[0.2em] text-slate-500 font-bold">HER PASSES:</p>
            {SEGMENTS.map(([k, label, cls]) => (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-4 h-4 rounded-sm ${cls}`} />
                <span className="text-xs font-bold text-slate-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {stats.length === 0 && <p className="text-slate-600">Nothing logged.</p>}
        <div className="space-y-3">
          {stats.map((p) => {
            const share = totalPassed ? Math.round((p.n / totalPassed) * 100) : 0;
            const isTarget = targetJersey === p.jersey;
            return (
              <div key={p.jersey} className={`flex items-center gap-4 rounded p-3 bg-slate-950 ${isTarget ? "ring-2 ring-white" : ""}`}>
                <div className="w-16 text-center shrink-0">
                  <p className="text-4xl font-black font-mono leading-none">{p.jersey}</p>
                  {isTarget && <p className="text-[9px] tracking-[0.2em] font-black bg-red-600 text-white rounded px-1 mt-1">TARGET</p>}
                </div>
                <div className="w-28 shrink-0">
                  <p className={`text-4xl font-black tabular-nums leading-none ${avgColor(p.avg, p.n)}`}>{fmt(p.avg)}</p>
                  <p className="text-[10px] font-mono text-slate-500">
                    {p.n} passes · {share}% of serves
                  </p>
                </div>
                <div className="flex-1 min-w-0 flex h-9 rounded-sm overflow-hidden bg-slate-800">
                  {SEGMENTS.map(([k, , cls, txt]) =>
                    p.counts[k] > 0 ? (
                      <div key={k} className={`${cls} ${txt} flex items-center justify-center text-sm font-black`} style={{ width: `${(p.counts[k] / p.n) * 100}%` }}>
                        {p.counts[k]}
                      </div>
                    ) : null
                  )}
                </div>
                {p.n < MIN_N && (
                  <span className="text-[10px] tracking-[0.2em] text-slate-400 font-bold shrink-0 text-right leading-tight">
                    TOO THIN
                    <br />
                    TO TRUST
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {srv.length > 0 && (
        <div className="px-4 pb-6">
          <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-1">OUR SERVERS — BEST AT THE TOP</p>
          <p className="text-slate-500 text-xs mb-2">How often her serve forced an ace or a broken pass. Green is good.</p>
          <div className="space-y-1 max-w-2xl">
            {srv.map((p) => (
              <div key={p.jersey} className="flex items-center gap-4 px-3 py-2 rounded bg-slate-950">
                <span className="w-10 text-xl font-black font-mono">{p.jersey}</span>
                <span className={`w-20 text-2xl font-black tabular-nums ${breakColor(p.breakPct ?? 0, p.n)}`}>{p.breakPct === null ? "—" : `${p.breakPct}%`}</span>
                <span className="text-xs tracking-[0.15em] text-slate-500 font-bold">BROKE THEM</span>
                <span className="flex-1" />
                <span className="text-xs font-mono text-slate-500">
                  {p.total} serves · {p.errs} missed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- app ------------------------------- */

export default function App() {
  const [screen, setScreen] = useState("home");
  const [archive, setArchive] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [reportScope, setReportScope] = useState("one");
  const [loaded, setLoaded] = useState(false);

  const [opponent, setOpponent] = useState("");
  const [vsTeam, setVsTeam] = useState("");
  const [matchType, setMatchType] = useState("match");
  const [live, setLive] = useState(false);
  const [receivers, setReceivers] = useState([]);
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [serves, setServes] = useState([]);
  const [currentSet, setCurrentSet] = useState(1);
  const [startedAt, setStartedAt] = useState(null);

  const [mode, setMode] = useState("log");
  const [scope, setScope] = useState("set");
  const [sheet, setSheet] = useState(null);
  const [flash, setFlash] = useState(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupText, setBackupText] = useState(null);

  function openImageShare({ title, subtitle, serves: list, receivers: recs, targetJersey, filename }) {
    const stats = statsFor(list, recs);
    if (!stats.length) return;
    const cv = buildReportImage({ title, subtitle, stats, totalPassed: list.filter((s) => s.rating !== "err").length, targetJersey });
    const dataUrl = cv.toDataURL("image/png");
    cv.toBlob((blob) => setSharing({ dataUrl, blob, filename }), "image/png");
  }

  const [saveState, setSaveState] = useState("clean");
  const [storageOff, setStorageOff] = useState(false);
  const dirty = useRef(false);
  const latest = useRef({});

  latest.current = { opponent, vsTeam, matchType, live, receivers, servers, currentServer, serves, currentSet, startedAt };

  useEffect(() => {
    if (!hasStorage()) setStorageOff(true);
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    const a = readKey(ARCHIVE_KEY);
    if (Array.isArray(a)) setArchive(a);
    const c = readKey(CUR_KEY);
    if (c && (c.live || (c.receivers && c.receivers.length))) {
      setOpponent(c.opponent || "");
      setVsTeam(c.vsTeam || "");
      setMatchType(c.matchType || "match");
      setLive(true);
      setReceivers(c.receivers || []);
      setServers(c.servers || []);
      setCurrentServer(c.currentServer ?? null);
      setServes(c.serves || []);
      setCurrentSet(c.currentSet || 1);
      setStartedAt(c.startedAt || new Date().toISOString());
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    dirty.current = true;
    setSaveState((s) => (s === "failed" ? "failed" : "pending"));
  }, [opponent, vsTeam, matchType, live, receivers, servers, currentServer, serves, currentSet, startedAt, loaded]);

  useEffect(() => {
    if (!loaded || storageOff) return;
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
      try {
        writeKey(CUR_KEY, latest.current);
        setSaveState("clean");
      } catch {
        dirty.current = true;
        setSaveState("failed");
      }
    };
    const t = setInterval(flush, FLUSH_MS);
    const hardFlush = () => {
      try {
        writeKey(CUR_KEY, latest.current);
        dirty.current = false;
      } catch {
        /* nothing else to do while unloading */
      }
    };
    document.addEventListener("visibilitychange", hardFlush);
    window.addEventListener("pagehide", hardFlush);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", hardFlush);
      window.removeEventListener("pagehide", hardFlush);
    };
  }, [loaded, storageOff]);

  function flushNow() {
    if (storageOff) return false;
    try {
      writeKey(CUR_KEY, latest.current);
      dirty.current = false;
      setSaveState("clean");
      return true;
    } catch {
      setSaveState("failed");
      return false;
    }
  }

  /* ---------------------------- actions ---------------------------- */

  function log(passer, rating) {
    setServes((s) => [...s, { id: Date.now() + Math.random(), set: currentSet, server: currentServer, passer, rating }]);
    setFlash(passer ? `#${passer} — ${rating === "ace" ? "ACE" : rating}` : "SERVE ERROR");
    setTimeout(() => setFlash(null), 800);
  }

  const undo = () => setServes((s) => s.slice(0, -1));

  function newMatch(type = "match") {
    setOpponent("");
    setVsTeam("");
    setMatchType(type);
    setLive(false);
    setReceivers([]);
    setServers([]);
    setCurrentServer(null);
    setServes([]);
    setCurrentSet(1);
    setStartedAt(new Date().toISOString());
    setMode("log");
    setScreen("setup");
  }

  function finishMatch() {
    const record = {
      id: startedAt || new Date().toISOString(),
      opponent: opponent || (matchType === "scout" ? "Unnamed team" : "Unnamed opponent"),
      vs: vsTeam.trim() || undefined,
      date: startedAt || new Date().toISOString(),
      type: matchType,
      receivers,
      servers,
      serves,
      sets: currentSet,
    };
    const next = [record, ...archive].slice(0, 120);
    setArchive(next);
    let ok = true;
    try {
      writeKey(ARCHIVE_KEY, next);
      writeKey(CUR_KEY, {});
      dirty.current = false;
      setSaveState("clean");
    } catch {
      ok = false;
      setSaveState("failed");
    }
    setConfirmFinish(false);
    if (ok) {
      setLive(false);
      setVsTeam("");
      setServes([]);
      setReceivers([]);
      setServers([]);
      setCurrentServer(null);
      setCurrentSet(1);
      setOpponent("");
      setScreen("home");
    }
  }

  function saveArchive(next) {
    setArchive(next);
    try {
      writeKey(ARCHIVE_KEY, next);
      return true;
    } catch {
      return false;
    }
  }

  function applyRename() {
    const newName = renaming.name.trim();
    if (!newName || !viewing) return;
    const oldKey = viewing.opponent.trim().toLowerCase();
    const newVs = renaming.vs.trim() || undefined;
    const next = archive.map((m) => {
      if (m.id === viewing.id) return { ...m, opponent: newName, vs: newVs };
      if (renaming.all && m.opponent.trim().toLowerCase() === oldKey) return { ...m, opponent: newName };
      return m;
    });
    saveArchive(next);
    setViewing({ ...viewing, opponent: newName, vs: newVs });
    setRenaming(null);
  }

  function deleteViewing() {
    if (!viewing) return;
    saveArchive(archive.filter((m) => m.id !== viewing.id));
    setConfirmDelete(false);
    setViewing(null);
    setScreen("home");
  }

  function mergeBackup(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return "That doesn't look like a Serve Target backup file.";
    }
    const list = Array.isArray(data) ? data : data && Array.isArray(data.archive) ? data.archive : null;
    if (!list) return "No matches found in that file.";
    const valid = list.filter((m) => m && m.id && m.opponent && Array.isArray(m.serves) && Array.isArray(m.receivers));
    if (!valid.length) return "No matches found in that file.";
    const have = new Set(archive.map((m) => m.id));
    const add = valid.filter((m) => !have.has(m.id));
    if (!add.length) return `Nothing new — all ${valid.length} matches in that file are already on this device.`;
    const next = [...add, ...archive].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 240);
    if (!saveArchive(next)) return "Couldn't save — this browser is blocking storage.";
    return `Added ${add.length} match${add.length === 1 ? "" : "es"}${valid.length > add.length ? ` (${valid.length - add.length} already here)` : ""}. All set.`;
  }

  const priorMeetings = useMemo(
    () => archive.filter((m) => m.opponent.trim().toLowerCase() === opponent.trim().toLowerCase() && opponent.trim()),
    [archive, opponent]
  );

  const priorPassers = useMemo(() => {
    if (!priorMeetings.length) return [];
    return statsFor(priorMeetings.flatMap((m) => m.serves), [...new Set(priorMeetings.flatMap((m) => m.receivers))]);
  }, [priorMeetings]);

  /* ---------------------------- analysis --------------------------- */

  const pool = useMemo(() => (scope === "set" ? serves.filter((s) => s.set === currentSet) : serves), [serves, scope, currentSet]);
  const totalPassed = pool.filter((s) => s.rating !== "err").length;
  const passerStats = useMemo(() => statsFor(pool, receivers), [pool, receivers]);

  const call = useMemo(() => {
    const lowestOverall = passerStats[0];
    const pick = passerStats.filter((p) => p.n >= MIN_N)[0];
    const skipped = lowestOverall && pick && lowestOverall.jersey !== pick.jersey ? lowestOverall : null;
    if (pick && pick.avg <= 2.3) return { kind: "passer", jersey: pick.jersey, text: `SERVE #${pick.jersey}`, avg: pick.avg, n: pick.n, skipped };
    if (totalPassed < 8) return { kind: "thin", text: "KEEP LOGGING", n: totalPassed, skipped };
    return { kind: "even", text: "NOBODY BREAKING", n: totalPassed, skipped };
  }, [passerStats, totalPassed]);

  const liveCounts = useMemo(() => {
    const m = {};
    receivers.forEach((j) => (m[j] = { ace: 0, 1: 0, 2: 0, 3: 0 }));
    pool.forEach((s) => {
      if (s.passer && m[s.passer] && s.rating !== "err") m[s.passer][s.rating] += 1;
    });
    return m;
  }, [pool, receivers]);

  const liveAvg = (j) => {
    const l = pool.filter((s) => s.passer === j && s.rating !== "err");
    return l.length ? l.reduce((a, s) => a + val(s.rating), 0) / l.length : null;
  };

  const addTo = (setter) => (j) => setter((l) => (l.includes(j) ? l : [...l, j]));
  const removeFrom = (setter) => (j) => setter((l) => l.filter((x) => x !== j));
  const ourErrors = pool.filter((s) => s.rating === "err").length;

  const matchCSV = (name, list) =>
    ["set,our_server,their_passer,rating", ...list.map((s) => `${s.set},${s.server ?? ""},${s.passer ?? ""},${s.rating}`)].join("\n");

  const SaveDot = () => {
    if (storageOff)
      return (
        <span className="flex items-center gap-1 text-[10px] tracking-[0.15em] font-bold text-red-400">
          <span className="w-2 h-2 rounded-full bg-red-500" /> NOT SAVING
        </span>
      );
    if (saveState === "failed")
      return (
        <button onClick={flushNow} className="flex items-center gap-1 text-[10px] tracking-[0.15em] font-bold text-red-400 active:text-white">
          <span className="w-2 h-2 rounded-full bg-red-500" /> SAVE FAILED — RETRY
        </button>
      );
    if (saveState === "pending")
      return (
        <span className="flex items-center gap-1 text-[10px] tracking-[0.15em] font-bold text-slate-500">
          <span className="w-2 h-2 rounded-full bg-slate-500" /> SAVING
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-[10px] tracking-[0.15em] font-bold text-slate-500">
        <span className="w-2 h-2 rounded-full bg-green-500" /> SAVED
      </span>
    );
  };

  if (!loaded) return <div className="min-h-screen bg-slate-900 text-slate-500 flex items-center justify-center">Loading…</div>;

  const exportSheet = exporting ? <ExportSheet {...exporting} onClose={() => setExporting(null)} /> : null;
  const imageSheet = sharing ? <ImageSheet {...sharing} onClose={() => setSharing(null)} /> : null;

  /* ============================== HOME ============================== */

  if (screen === "home") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <p className="text-blue-400 text-xs tracking-[0.3em] font-bold">SERVE TARGET</p>
          <SaveDot />
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-6">Matches</h1>

        {storageOff && (
          <div className="rounded bg-slate-950 ring-1 ring-red-500 p-4 mb-6">
            <p className="font-black text-red-400 mb-1">This browser isn't giving the app any storage.</p>
            <p className="text-slate-400 text-sm">
              Everything still works, but nothing survives a refresh. You may be in a private browsing tab — switch to a normal one.
            </p>
          </div>
        )}

        {live && (
          <button onClick={() => setScreen("match")} className={`w-full text-left rounded p-4 mb-3 ${matchType === "scout" ? "bg-purple-700 active:bg-purple-600" : "bg-blue-600 active:bg-blue-500"}`}>
            <p className="text-[10px] tracking-[0.3em] font-black">{matchType === "scout" ? "SCOUTING IN PROGRESS" : "IN PROGRESS"}</p>
            <p className="text-2xl font-black">{opponent || "Unnamed opponent"}</p>
            <p className={`text-sm font-mono ${matchType === "scout" ? "text-purple-200" : "text-blue-100"}`}>
              Set {currentSet} · {serves.length} serves logged — tap to resume
            </p>
          </button>
        )}

        <div className="flex gap-3 mb-8">
          <button onClick={() => newMatch()} className="flex-1 rounded bg-blue-600 text-xl font-black tracking-wide py-5 active:bg-blue-500">
            NEW MATCH
          </button>
          <button onClick={() => newMatch("scout")} className="flex-1 rounded bg-purple-700 text-xl font-black tracking-wide py-5 active:bg-purple-600">
            SCOUT A TEAM
          </button>
        </div>
        <p className="text-slate-500 text-sm -mt-6 mb-8">
          Scout while watching a team play someone else. When you face them later, their passers and grades load in automatically.
        </p>

        <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-3">SAVED MATCHES</p>
        {archive.length === 0 && <p className="text-slate-600">Nothing saved yet. Finish a match and it lands here.</p>}
        <div className="space-y-2">
          {archive.map((m) => {
            const top = statsFor(m.serves, m.receivers)[0];
            return (
              <button
                key={m.id}
                onClick={() => {
                  setViewing(m);
                  setReportScope("one");
                  setScreen("report");
                }}
                className="w-full text-left rounded bg-slate-950 p-3 flex items-center gap-4 active:bg-slate-800"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-black truncate">
                    {m.opponent}
                    {m.type === "scout" && <span className="ml-2 align-middle text-[9px] tracking-[0.2em] font-black bg-purple-700 text-white rounded px-1.5 py-0.5">SCOUT</span>}
                  </p>
                  <p className="text-xs font-mono text-slate-500">
                    {m.vs ? `vs ${m.vs} · ` : ""}
                    {prettyDate(m.date)} · {m.sets} sets · {m.serves.length} serves
                  </p>
                </div>
                {top && (
                  <div className="text-right shrink-0">
                    <p className="text-[10px] tracking-[0.2em] text-slate-500 font-bold">WEAKEST</p>
                    <p className={`text-xl font-black font-mono ${avgColor(top.avg, top.n)}`}>
                      #{top.jersey} · {fmt(top.avg)}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex gap-2 flex-wrap">
          {archive.length > 0 && (
            <button
              onClick={() =>
                setExporting({
                  title: "WHOLE SEASON",
                  filename: "serve-receive-season.csv",
                  text: [
                    "opponent,date,type,set,our_server,their_passer,rating",
                    ...archive.flatMap((m) => m.serves.map((s) => `"${m.opponent}",${m.date.slice(0, 10)},${m.type || "match"},${s.set},${s.server ?? ""},${s.passer ?? ""},${s.rating}`)),
                  ].join("\n"),
                })
              }
              className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
            >
              EXPORT WHOLE SEASON
            </button>
          )}
          {archive.length > 0 && (
            <button
              onClick={() => setBackupText(JSON.stringify({ app: "serve-target", version: APP_VERSION, exportedAt: new Date().toISOString(), archive }))}
              className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
            >
              BACKUP
            </button>
          )}
          <button onClick={() => setRestoreOpen(true)} className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700">
            RESTORE
          </button>
        </div>

        <p className="text-slate-700 text-xs font-mono mt-10">Serve Target v{APP_VERSION} · data lives on this device — export after matches</p>
        {exportSheet}
        {backupText && <BackupSheet text={backupText} filename={`serve-target-backup-${new Date().toISOString().slice(0, 10)}.json`} onClose={() => setBackupText(null)} />}
        {restoreOpen && <RestoreSheet onRestore={mergeBackup} onClose={() => setRestoreOpen(false)} />}
      </div>
    );
  }

  /* ============================= REPORT ============================= */

  if (screen === "report" && viewing) {
    const related = archive.filter((m) => m.opponent.trim().toLowerCase() === viewing.opponent.trim().toLowerCase());
    const combined = reportScope === "all" && related.length > 1;
    const rServes = combined ? related.flatMap((m) => m.serves) : viewing.serves;
    const rReceivers = combined ? [...new Set(related.flatMap((m) => m.receivers))] : viewing.receivers;
    const rServers = combined ? [...new Set(related.flatMap((m) => m.servers || []))] : viewing.servers || [];
    const top = statsFor(rServes, rReceivers).filter((p) => p.n >= MIN_N)[0];
    return (
      <div className="min-h-screen bg-slate-900 text-white overflow-auto">
        <div className="flex items-center gap-4 px-4 py-3 bg-slate-950 border-b border-slate-700">
          <button onClick={() => setScreen("home")} className="text-slate-400 font-black tracking-wide px-2 active:text-white">
            ← BACK
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-black truncate">
              {viewing.opponent}
              {!combined && viewing.type === "scout" && <span className="ml-2 align-middle text-[9px] tracking-[0.2em] font-black bg-purple-700 text-white rounded px-1.5 py-0.5">SCOUT</span>}
              {combined && <span className="ml-2 align-middle text-[9px] tracking-[0.2em] font-black bg-blue-600 text-white rounded px-1.5 py-0.5">COMBINED</span>}
            </p>
            <p className="text-xs font-mono text-slate-500">
              {combined
                ? `${related.length} meetings · ${rServes.length} serves total`
                : `${viewing.vs ? `vs ${viewing.vs} · ` : ""}${prettyDate(viewing.date)} · ${viewing.sets} sets · ${viewing.serves.length} serves`}
            </p>
          </div>
          <button
            onClick={() =>
              setExporting(
                combined
                  ? {
                      title: `${viewing.opponent.toUpperCase()} — ALL MEETINGS`,
                      filename: `serve-receive-${viewing.opponent.replace(/\s+/g, "-").toLowerCase()}-combined.csv`,
                      text: [
                        "date,type,set,our_server,their_passer,rating",
                        ...related.flatMap((m) => m.serves.map((s) => `${m.date.slice(0, 10)},${m.type || "match"},${s.set},${s.server ?? ""},${s.passer ?? ""},${s.rating}`)),
                      ].join("\n"),
                    }
                  : {
                      title: viewing.opponent.toUpperCase(),
                      filename: `serve-receive-${viewing.opponent.replace(/\s+/g, "-").toLowerCase()}.csv`,
                      text: matchCSV(viewing.opponent, viewing.serves),
                    }
              )
            }
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-4 py-2 text-sm active:bg-slate-700"
          >
            EXPORT
          </button>
          <button
            onClick={() =>
              openImageShare({
                title: viewing.opponent.toUpperCase(),
                subtitle: combined
                  ? `${related.length} meetings · ${rServes.length} serves total`
                  : `${prettyDate(viewing.date)} · ${viewing.sets} sets · ${viewing.serves.length} serves`,
                serves: rServes,
                receivers: rReceivers,
                targetJersey: top && top.jersey,
                filename: `serve-target-${viewing.opponent.replace(/\s+/g, "-").toLowerCase()}${combined ? "-combined" : ""}.png`,
              })
            }
            className="rounded bg-blue-600 font-black tracking-wide px-4 py-2 text-sm active:bg-blue-500"
          >
            IMAGE
          </button>
        </div>

        {related.length > 1 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-slate-950 border-b border-slate-700">
            <p className="text-[10px] tracking-[0.2em] text-slate-500 font-bold">
              YOU'VE SEEN THEM {related.length} TIME{related.length === 1 ? "" : "S"}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setReportScope("one")}
                className={`px-3 py-1.5 rounded text-[10px] tracking-[0.2em] font-bold ${!combined ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                THIS ONE
              </button>
              <button
                onClick={() => setReportScope("all")}
                className={`px-3 py-1.5 rounded text-[10px] tracking-[0.2em] font-bold ${combined ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                ALL {related.length} COMBINED
              </button>
            </div>
            {combined && (
              <p className="text-xs text-slate-500 truncate">
                {related
                  .slice()
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((m) => `${prettyDate(m.date)}${m.type === "scout" ? ` (scout${m.vs ? ` vs ${m.vs}` : ""})` : ""}`)
                  .join(" · ")}
              </p>
            )}
          </div>
        )}

        <PasserReport
          serves={rServes}
          receivers={rReceivers}
          servers={rServers}
          targetJersey={top && top.jersey}
          note={combined ? "Every meeting combined — the fullest read on them you have." : "Full match. Red is a passer breaking down."}
        />

        <div className="px-4 pb-8 flex gap-2 flex-wrap">
          <button
            onClick={() => setRenaming({ name: viewing.opponent, vs: viewing.vs || "", all: related.length > 1 })}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-5 py-2.5 text-sm text-slate-300 active:bg-slate-700"
          >
            RENAME
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-5 py-2.5 text-sm text-red-400 active:bg-slate-700"
          >
            DELETE
          </button>
        </div>

        {renaming && (
          <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-50 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-slate-900 ring-1 ring-slate-700 rounded-lg p-6">
              <p className="text-2xl font-black mb-4">Rename</p>
              <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">TEAM NAME</p>
              <input
                value={renaming.name}
                onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                className="w-full bg-slate-800 ring-1 ring-slate-600 rounded px-4 py-3 text-xl mb-4 focus:outline-none focus:ring-blue-500"
              />
              {viewing.type === "scout" && (
                <>
                  <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">WHO THEY WERE PLAYING — OPTIONAL</p>
                  <input
                    value={renaming.vs}
                    onChange={(e) => setRenaming({ ...renaming, vs: e.target.value })}
                    placeholder="Norwell"
                    className="w-full bg-slate-800 ring-1 ring-slate-600 rounded px-4 py-3 text-xl mb-4 focus:outline-none focus:ring-blue-500"
                  />
                </>
              )}
              {related.length > 1 && (
                <button
                  onClick={() => setRenaming({ ...renaming, all: !renaming.all })}
                  className="w-full text-left rounded bg-slate-950 ring-1 ring-slate-700 p-3 mb-4 active:bg-slate-800 flex items-center gap-3"
                >
                  <span className={`w-6 h-6 rounded shrink-0 flex items-center justify-center font-black ${renaming.all ? "bg-blue-600 text-white" : "bg-slate-800 ring-1 ring-slate-600 text-transparent"}`}>✓</span>
                  <span className="text-sm text-slate-300">
                    Rename all {related.length} records of <span className="font-bold text-white">{viewing.opponent}</span> so they stay combined
                  </span>
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={applyRename} disabled={!renaming.name.trim()} className="flex-1 rounded bg-blue-600 font-black tracking-wide py-4 active:bg-blue-500 disabled:opacity-30">
                  SAVE
                </button>
                <button onClick={() => setRenaming(null)} className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 active:bg-slate-700">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-50 flex items-center justify-center p-6">
            <div className="w-full max-w-md bg-slate-900 ring-1 ring-slate-700 rounded-lg p-6">
              <p className="text-2xl font-black mb-2">Delete this record?</p>
              <p className="text-slate-400 mb-6">
                {viewing.opponent} — {prettyDate(viewing.date)}, {viewing.serves.length} serves. This can't be undone. Other records against them are untouched.
              </p>
              <div className="flex gap-2">
                <button onClick={deleteViewing} className="flex-1 rounded bg-red-600 font-black tracking-wide py-4 active:bg-red-500">
                  DELETE IT
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 active:bg-slate-700">
                  KEEP IT
                </button>
              </div>
            </div>
          </div>
        )}

        {exportSheet}
        {imageSheet}
      </div>
    );
  }

  /* ============================== SETUP ============================= */

  if (screen === "setup") {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 overflow-auto">
        <button onClick={() => setScreen("home")} className="text-slate-400 font-black tracking-wide mb-4 active:text-white">
          ← BACK
        </button>
        <h1 className="text-4xl font-black tracking-tight mb-2">{matchType === "scout" ? "Scout a team" : "New match"}</h1>
        {matchType === "scout" && (
          <p className="text-slate-400 mb-6">Watching them play someone else. Name them exactly how you'll name them on game day so the grades carry over.</p>
        )}
        {matchType !== "scout" && <div className="mb-6" />}

        <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">{matchType === "scout" ? "TEAM YOU'RE SCOUTING" : "OPPONENT"}</p>
        <input
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Adams Central"
          className="w-full bg-slate-800 ring-1 ring-slate-600 rounded px-4 py-4 text-2xl mb-3 focus:outline-none focus:ring-blue-500"
        />

        {matchType === "scout" && (
          <>
            <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">WHO THEY'RE PLAYING — OPTIONAL</p>
            <input
              value={vsTeam}
              onChange={(e) => setVsTeam(e.target.value)}
              placeholder="Norwell"
              className="w-full bg-slate-800 ring-1 ring-slate-600 rounded px-4 py-3 text-xl mb-1 focus:outline-none focus:ring-blue-500"
            />
            <p className="text-slate-500 text-sm mb-3">Just a label for your records — combining and game-day carryover only look at the team you're scouting.</p>
          </>
        )}

        {priorPassers.length > 0 && (
          <div className="rounded bg-slate-950 ring-1 ring-blue-500 p-4 mb-6">
            <p className="text-[10px] tracking-[0.3em] text-blue-400 font-bold mb-2">
              {(() => {
                const played = priorMeetings.filter((m) => m.type !== "scout").length;
                const scouted = priorMeetings.length - played;
                const parts = [];
                if (played) parts.push(`PLAYED THEM ${played} TIME${played === 1 ? "" : "S"}`);
                if (scouted) parts.push(`SCOUTED THEM ${scouted} TIME${scouted === 1 ? "" : "S"}`);
                return `YOU'VE ${parts.join(" · ")}`;
              })()}
            </p>
            <div className="flex flex-wrap gap-4 mb-3">
              {priorPassers.map((p) => (
                <div key={p.jersey} className="text-center">
                  <p className="text-2xl font-black font-mono">#{p.jersey}</p>
                  <p className={`text-lg font-black tabular-nums ${avgColor(p.avg, p.n)}`}>{fmt(p.avg)}</p>
                  <p className="text-[10px] font-mono text-slate-500">n{p.n}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setReceivers([...new Set(priorMeetings.flatMap((m) => m.receivers))])} className="rounded bg-blue-600 font-black tracking-wide px-4 py-2 text-sm active:bg-blue-500">
              LOAD THEIR PASSERS
            </button>
          </div>
        )}

        <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">THEIR PASSERS — OPTIONAL</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {receivers.map((j) => (
            <span key={j} className="h-14 min-w-[4rem] px-4 rounded flex items-center justify-center text-2xl font-black font-mono bg-slate-800 ring-1 ring-slate-600">
              {j}
            </span>
          ))}
          <button onClick={() => setSheet("receivers")} className="h-14 px-5 rounded bg-blue-600 font-black tracking-wide active:bg-blue-500">
            {receivers.length ? "EDIT" : "ADD NUMBERS"}
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-8">
          Libero and both pin passers if you know them. Don't know numbers yet? Just start — add each jersey the first time she takes a serve.
        </p>

        {matchType !== "scout" && (
          <>
            <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold mb-2">OUR SERVERS — OPTIONAL</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {servers.map((j) => (
                <span key={j} className="h-14 min-w-[4rem] px-4 rounded flex items-center justify-center text-2xl font-black font-mono bg-slate-800 ring-1 ring-slate-600">
                  {j}
                </span>
              ))}
              <button onClick={() => setSheet("servers")} className="h-14 px-5 rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide active:bg-slate-700">
                {servers.length ? "EDIT" : "ADD NUMBERS"}
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-8">Add these to see which of your servers is actually breaking them.</p>
          </>
        )}

        <button
          onClick={() => { setLive(true); setScreen("match"); }}
          className={`w-full rounded text-xl font-black tracking-wide py-5 ${matchType === "scout" ? "bg-purple-700 active:bg-purple-600" : "bg-blue-600 active:bg-blue-500"}`}
        >
          {matchType === "scout" ? "START SCOUTING" : "START TRACKING"}
        </button>

        {sheet === "receivers" && <Keypad title="THEIR PASSERS" hint="Tap a number to remove it." chips={receivers} onAdd={addTo(setReceivers)} onRemove={removeFrom(setReceivers)} onClose={() => setSheet(null)} />}
        {sheet === "servers" && <Keypad title="OUR SERVERS" hint="Tap a number to remove it." chips={servers} onAdd={addTo(setServers)} onRemove={removeFrom(setServers)} onClose={() => setSheet(null)} />}
      </div>
    );
  }

  /* ============================== MATCH ============================= */

  return (
    <div className="h-screen bg-slate-900 text-white select-none flex flex-col overflow-hidden">
      <div className="flex items-stretch bg-slate-950 border-b border-slate-700 shrink-0">
        <button onClick={() => { flushNow(); setScreen("home"); }} className="px-4 border-r border-slate-700 text-slate-400 font-black active:bg-slate-800">
          ←
        </button>
        <div className="px-4 py-2 flex-1 min-w-0">
          <div className="flex items-center gap-3">
            {matchType === "scout" && <span className="text-[9px] tracking-[0.2em] font-black bg-purple-700 text-white rounded px-1.5 py-0.5 shrink-0">SCOUT</span>}
            <p className="text-blue-400 text-[10px] tracking-[0.3em] font-bold truncate">
              {(opponent || (matchType === "scout" ? "SCOUTING" : "OPPONENT")).toUpperCase()}
              {matchType === "scout" && vsTeam.trim() && <span className="text-slate-500"> VS {vsTeam.trim().toUpperCase()}</span>}
            </p>
            <SaveDot />
          </div>
          <p className="text-base font-black tracking-tight truncate">
            SET {currentSet} · {pool.length} SERVES
          </p>
        </div>
        {matchType !== "scout" && (
          <button onClick={() => setSheet("pickServer")} className="px-6 border-l border-slate-700 text-center active:bg-slate-800">
            <p className="text-[10px] tracking-[0.2em] text-slate-400 font-bold">SERVING</p>
            <p className="text-2xl font-black font-mono text-blue-400 leading-none">
              {currentServer ? `#${currentServer}` : <span className="text-slate-600 text-base font-sans">SET</span>}
            </p>
          </button>
        )}
        <button onClick={() => setSheet("receivers")} className="px-5 border-l border-slate-700 text-center active:bg-slate-800">
          <p className="text-[10px] tracking-[0.2em] text-slate-400 font-bold">THEIR</p>
          <p className="text-lg font-black leading-none">SUB</p>
        </button>
        <button onClick={undo} disabled={!serves.length} className="px-6 border-l border-slate-700 text-center active:bg-slate-800 disabled:opacity-30">
          <p className="text-[10px] tracking-[0.2em] text-slate-400 font-bold">UNDO</p>
          <p className="text-xl font-black leading-none">←</p>
        </button>
        <button onClick={() => setMode(mode === "log" ? "read" : "log")} className={`px-8 border-l border-slate-700 font-black tracking-wide ${mode === "read" ? "bg-blue-600" : "bg-slate-800 text-blue-400"}`}>
          {mode === "log" ? "READ" : "LOG"}
        </button>
      </div>

      {/* -------------------------- LOG -------------------------- */}
      {mode === "log" && (
        <div className="flex-1 flex flex-col p-3 min-h-0">
          <div className="flex gap-2 mb-2 shrink-0">
            <div className="w-32 shrink-0 flex items-end">
              <p className="text-[10px] tracking-[0.2em] text-slate-500 font-bold leading-tight">
                THEIR PASSER
                <br />
                <span className="text-slate-600">RED = SERVE HER</span>
              </p>
            </div>
            {RATINGS.map((r) => (
              <div key={r.id} className="flex-1 text-center">
                <p className={`text-xl font-black leading-none ${r.text}`}>{r.label}</p>
                <p className="text-[9px] tracking-[0.15em] text-slate-500 font-bold">{r.sub}</p>
              </div>
            ))}
          </div>

          <div className="flex-1 flex flex-col gap-2 min-h-0">
            {receivers.length === 0 && (
              <button
                onClick={() => setSheet("receivers")}
                className="flex-1 rounded border-2 border-dashed border-slate-600 flex flex-col items-center justify-center gap-2 active:bg-slate-800"
              >
                <p className="text-3xl font-black tracking-tight">ADD A PASSER NUMBER</p>
                <p className="text-slate-400 max-w-md">
                  No roster needed — tap here the first time a jersey takes a serve, punch in her number, and she gets a row. Keep adding as you spot them.
                </p>
              </button>
            )}
            {receivers.map((j) => {
              const a = liveAvg(j);
              const c = liveCounts[j] || { ace: 0, 1: 0, 2: 0, 3: 0 };
              const n = c.ace + c[1] + c[2] + c[3];
              const isTarget = call.kind === "passer" && call.jersey === j;
              const isWatch = call.skipped && call.skipped.jersey === j;
              return (
                <div key={j} className="flex gap-2 flex-1 min-h-[4rem]">
                  <div className={`w-32 shrink-0 rounded flex flex-col items-center justify-center relative bg-slate-950 ${isTarget ? "ring-2 ring-white" : isWatch ? "ring-1 ring-slate-500" : ""}`}>
                    {isTarget && <span className="absolute top-1 text-[9px] tracking-[0.2em] font-black bg-red-600 text-white rounded px-1">TARGET</span>}
                    {isWatch && <span className="absolute top-1 text-[9px] tracking-[0.2em] font-black text-slate-400">THIN</span>}
                    <span className="text-4xl font-black font-mono leading-none mt-2">{j}</span>
                    <span className={`text-sm font-mono ${avgColor(a ?? 3, n)}`}>
                      {a === null ? "—" : a.toFixed(2)} <span className="text-slate-500">n{n}</span>
                    </span>
                  </div>
                  {RATINGS.map((r) => (
                    <button key={r.id} onClick={() => log(j, r.id)} className={`flex-1 rounded bg-slate-800 ring-1 ring-slate-600 relative ${r.fill} active:text-white`}>
                      <span className={`text-3xl font-black ${r.text}`}>{r.label}</span>
                      {c[r.id] > 0 && <span className="absolute bottom-1 right-2 text-xs font-mono text-slate-500">{c[r.id]}</span>}
                    </button>
                  ))}
                </div>
              );
            })}
            {receivers.length > 0 && receivers.length < 8 && (
              <button
                onClick={() => setSheet("receivers")}
                className="h-9 shrink-0 rounded bg-slate-950 ring-1 ring-slate-700 text-slate-500 text-[11px] font-black tracking-[0.25em] active:bg-slate-700 active:text-white"
              >
                + ADD PASSER
              </button>
            )}
          </div>

          <div className="flex gap-2 mt-2 shrink-0">
            <button onClick={() => log(null, "err")} className="w-56 h-14 rounded bg-slate-950 ring-1 ring-slate-700 text-slate-400 font-black tracking-[0.2em] text-sm active:bg-slate-700 active:text-white">
              {matchType === "scout" ? "MISSED SERVE" : "OUR SERVE ERROR"} {ourErrors > 0 && <span className="font-mono ml-1">{ourErrors}</span>}
            </button>
            <div className="flex-1 h-14 rounded bg-slate-950 flex items-center px-4 gap-4 overflow-hidden">
              {flash ? (
                <p className="text-blue-400 font-black tracking-wide">LOGGED {flash}</p>
              ) : (
                <>
                  <p className={`font-black tracking-tight shrink-0 ${call.kind === "passer" ? "text-2xl text-red-500" : "text-base text-slate-500"}`}>{call.text}</p>
                  <p className="text-slate-500 text-sm truncate">
                    {call.avg !== undefined ? `${fmt(call.avg)} on ${call.n} passes` : call.kind === "thin" ? `${call.n} logged — need ${8 - call.n} more` : `${call.n} passes, nobody under 2.30`}
                    {call.skipped && ` · #${call.skipped.jersey} is lower at ${fmt(call.skipped.avg)} but only ${call.skipped.n}`}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* -------------------------- READ ------------------------- */}
      {mode === "read" && (
        <div className="flex-1 overflow-auto">
          <div className="flex items-center gap-5 px-4 py-3 bg-slate-950 border-b border-slate-700">
            <div>
              <p className="text-[10px] tracking-[0.3em] text-slate-400 font-bold">THE CALL</p>
              <p className={`font-black tracking-tighter leading-none ${call.kind === "passer" ? "text-5xl text-red-500" : "text-2xl text-slate-500"}`}>{call.text}</p>
            </div>
            <div className="flex-1">
              <p className="text-slate-400 text-sm">
                {call.avg !== undefined
                  ? `Lowest passing average on the floor — ${fmt(call.avg)} across ${call.n} serves.`
                  : call.kind === "thin"
                  ? `${call.n} passes logged. Give it ${8 - call.n} more before changing anything.`
                  : `${call.n} passes and nobody under 2.30. Go after the seams and their setter instead.`}
              </p>
              {call.skipped && (
                <p className="text-amber-300 text-sm mt-1">
                  Watch #{call.skipped.jersey} — she's lower at {fmt(call.skipped.avg)}, but only {call.skipped.n} pass{call.skipped.n === 1 ? "" : "es"} so far.
                </p>
              )}
            </div>
            <div className="flex gap-1">
              {["set", "match"].map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`px-3 py-1 rounded text-[10px] tracking-[0.2em] font-bold ${scope === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400"}`}>
                  {s === "set" ? "THIS SET" : "MATCH"}
                </button>
              ))}
            </div>
          </div>

          <PasserReport serves={pool} receivers={receivers} servers={servers} targetJersey={call.kind === "passer" ? call.jersey : null} />

          <div className="px-4 pb-8 flex gap-2 flex-wrap">
            <button onClick={() => { setCurrentSet((s) => s + 1); setMode("log"); }} className="rounded bg-blue-600 font-black tracking-wide px-8 py-3 active:bg-blue-500">
              START SET {currentSet + 1}
            </button>
            <button onClick={() => setConfirmFinish(true)} className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700">
              FINISH &amp; SAVE MATCH
            </button>
            <button
              onClick={() =>
                setExporting({
                  title: (opponent || "MATCH").toUpperCase(),
                  filename: `serve-receive-${(opponent || "match").replace(/\s+/g, "-").toLowerCase()}.csv`,
                  text: matchCSV(opponent, serves),
                })
              }
              className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 py-3 active:bg-slate-700"
            >
              EXPORT
            </button>
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-90 z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-slate-900 ring-1 ring-slate-700 rounded-lg p-6">
            <p className="text-2xl font-black mb-2">{matchType === "scout" ? "Save this scouting report?" : "Save this match?"}</p>
            <p className="text-slate-400 mb-6">
              {opponent || "Unnamed opponent"} — {currentSet} set{currentSet === 1 ? "" : "s"}, {serves.length} serves.{" "}
              {matchType === "scout" ? "When you play them, their passers and these grades load into match setup." : "It moves to your saved matches and the tracker clears for the next one."}
            </p>
            {saveState === "failed" && <p className="text-red-400 text-sm font-bold mb-4">Last save failed. Export first — closing now could lose this match.</p>}
            <div className="flex gap-2">
              <button onClick={finishMatch} className="flex-1 rounded bg-blue-600 font-black tracking-wide py-4 active:bg-blue-500">
                SAVE AND CLOSE
              </button>
              <button onClick={() => setConfirmFinish(false)} className="rounded bg-slate-800 ring-1 ring-slate-600 font-black tracking-wide px-6 active:bg-slate-700">
                KEEP GOING
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === "receivers" && <Keypad title="THEIR PASSERS" hint="Add whoever subbed in. Tap a number to take her out." chips={receivers} onAdd={addTo(setReceivers)} onRemove={removeFrom(setReceivers)} onClose={() => setSheet(null)} />}
      {sheet === "pickServer" && (
        <Keypad title="WHO'S SERVING" hint="Tap a number to put her back there, or add a new one." chips={servers} pickMode onAdd={addTo(setServers)} onPick={(j) => { setCurrentServer(j); setSheet(null); }} onRemove={() => {}} onClose={() => setSheet(null)} />
      )}
      {exportSheet}
    </div>
  );
}
