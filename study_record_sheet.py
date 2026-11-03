#!/usr/bin/env python3
"""Double-click to open the study timestamp sheet in your default browser.

Requires Python 3.8+; no packages to install. Keep this Python window open
while using the sheet. Close the window or press Ctrl+C when finished.
Everything needed by the page is embedded in this one file.
"""

import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import sys
from threading import Timer
import webbrowser

HOST = "127.0.0.1"
PORT = 8766
URL = "http://{}:{}/".format(HOST, PORT)
APP_ID = "llm-av-study-record-sheet"
HEALTH_PATH = "/_record_sheet/health"


class RecordSheetHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_page(include_body=True)

    def do_HEAD(self):
        self.send_page(include_body=False)

    def send_page(self, include_body):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            body = HTML_BYTES
            content_type = "text/html; charset=utf-8"
        elif path == HEALTH_PATH:
            body = json.dumps({"application": APP_ID}).encode("utf-8")
            content_type = "application/json"
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def log_message(self, format, *args):
        pass


class RecordSheetServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = not hasattr(socket, "SO_EXCLUSIVEADDRUSE")

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def already_running():
    connection = http.client.HTTPConnection(HOST, PORT, timeout=2)
    try:
        connection.request("GET", HEALTH_PATH)
        response = connection.getresponse()
        return response.status == 200 and json.loads(response.read(1024)).get("application") == APP_ID
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        connection.close()


def open_sheet():
    try:
        if not webbrowser.open(URL, new=2):
            print("Open this address in your browser: " + URL, flush=True)
    except webbrowser.Error:
        print("Open this address in your browser: " + URL, flush=True)


def main():
    try:
        server = RecordSheetServer((HOST, PORT), RecordSheetHandler)
    except OSError as exc:
        if already_running():
            open_sheet()
            return 0
        raise RuntimeError(
            "Could not start the record sheet on port {}. Close any other "
            "program using this port, then try again. Your browser's saved "
            "participant sheets are unchanged.".format(PORT)
        ) from exc
    with server:
        print("Study record sheet: " + URL, flush=True)
        print("Keep this window open while using the sheet. Close it or press Ctrl+C to stop.", flush=True)
        browser_timer = Timer(0.3, open_sheet)
        browser_timer.daemon = True
        browser_timer.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nRecord sheet closed.", flush=True)
        finally:
            browser_timer.cancel()
    return 0


# The complete page is embedded so this file can run from any folder.
HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Local researcher timestamp sheet for the LLM and AV study.">
  <title>Study record sheet · LLM × AV</title>
  <link rel="icon" href="data:,">
  <style>
    :root { color-scheme: light; --ink:#20342f; --muted:#63736e; --line:#dce4df; --green:#256b54; --pale:#eaf3ee; --orange:#a55421; --purple:#815287; }
    * { box-sizing:border-box; }
    body { margin:0; background:#f4f6f3; color:var(--ink); font:18px/1.5 "Segoe UI",system-ui,sans-serif; }
    button,input,select,textarea { font:inherit; }
    button { cursor:pointer; }
    button:disabled { cursor:default; opacity:.45; }
    button,input,select,textarea { border:1px solid #b9c9c0; border-radius:7px; }
    button { min-height:40px; padding:8px 15px; background:white; color:var(--ink); font-weight:600; }
    button:hover:not(:disabled) { background:#edf3ee; border-color:var(--green); }
    button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible { outline:3px solid #8fbdae; outline-offset:3px; }
    .primary { background:var(--green); color:white; border-color:var(--green); }
    .primary:hover:not(:disabled) { background:#19523f; color:white; }
    main { max-width:1320px; margin:auto; padding:32px 30px 45px; }
    .masthead,.toolbar,.section-title,.sheet-top,.dialog-actions,.utility { display:flex; align-items:center; justify-content:space-between; gap:20px; }
    .eyebrow { margin:0 0 7px; font-size:14px; letter-spacing:.12em; font-weight:700; color:var(--green); }
    h1 { margin:0; font-size:36px; line-height:1.25; letter-spacing:-.8px; font-weight:650; }
    .subtitle { color:var(--muted); margin:8px 0 0; }
    .clock { border-left:1px solid var(--line); padding-left:25px; min-width:250px; font-variant-numeric:tabular-nums; }
    .clock-line { display:flex; align-items:baseline; gap:14px; }
    .clock-line span { width:48px; color:var(--muted); font-size:14px; font-weight:650; letter-spacing:.07em; }
    .clock-line strong { font:600 24px/1.55 ui-monospace,Consolas,monospace; }
    .clock small { color:var(--muted); font-size:14px; }
    .toolbar { margin:28px 0 15px; }
    .archive { display:flex; align-items:center; gap:10px; min-width:0; }
    .archive label { color:var(--muted); font-size:15px; white-space:nowrap; }
    .archive select { min-width:215px; max-width:350px; padding:8px 30px 8px 10px; background:white; }
    .actions { display:flex; gap:9px; }
    .panel { background:white; border:1px solid var(--line); border-radius:12px; }
    .metadata { padding:22px 24px 18px; }
    .fields { display:grid; grid-template-columns:1fr 1fr 1.6fr; gap:18px; }
    .field label { display:block; margin:0 0 6px; font-size:16px; font-weight:650; }
    .field input,.field select,.field textarea { width:100%; background:#fcfdfb; color:var(--ink); padding:9px 11px; min-height:42px; }
    .field textarea { min-height:62px; resize:vertical; }
    .field small { display:block; color:var(--muted); font-size:14px; margin-top:5px; }
    .session-notes { margin-top:24px; padding:22px 24px; }
    .session-notes textarea { min-height:120px; }
    .save-line { margin-top:12px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:6px 15px; color:var(--muted); font-size:14px; }
    #saveStatus { color:var(--green); }
    .notice { margin:14px 0; padding:12px 16px; border:1px solid #ddbf8d; border-radius:8px; background:#fff7e8; color:#704a18; font-size:16px; }
    .notice[hidden] { display:none; }
    .sheet-top { margin:26px 0 11px; }
    .sheet-top h2 { margin:0; font-size:22px; letter-spacing:-.25px; }
    .progress { color:var(--muted); font-size:15px; text-align:right; }
    progress { display:block; width:180px; height:4px; margin-top:5px; accent-color:var(--green); border:0; border-radius:5px; }
    .timeline { overflow:hidden; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    col.activity { width:34%; } col.point { width:24%; } col.elapsed { width:10%; } col.adjust { width:8%; }
    thead { background:#f8faf7; }
    th { color:var(--muted); font-size:14px; letter-spacing:.06em; text-align:left; padding:12px 20px; font-weight:650; }
    td { padding:13px 20px; border-top:1px solid #edf0ec; vertical-align:middle; }
    .group-row th { padding:12px 20px; background:#edf2ec; color:#456555; border-top:1px solid var(--line); font-size:16px; letter-spacing:.03em; }
    .task-cell { display:flex; align-items:center; gap:12px; }
    .step-icon { flex:none; display:grid; place-items:center; width:36px; height:36px; border:1px solid #cdded1; border-radius:9px; color:var(--green); background:#f2f7f1; font-size:14px; font-weight:700; }
    tr[data-kind="agent"] .step-icon { color:var(--purple); background:#f5eef7; border-color:#e2d2e6; }
    tr[data-kind="drive"] .step-icon { color:var(--orange); background:#fff3eb; border-color:#f1d6c1; }
    .task-name { font-size:18px; font-weight:600; }
    .task-state { color:var(--muted); font-size:14px; margin-top:2px; }
    .running { background:#f4faf6; }
    .running .task-state { color:var(--green); }
    .skipped { background:#fafbf9; }
    .skipped .task-name { color:#829088; }
    .capture { width:116px; min-height:46px; font-size:17px; background:#f8faf7; }
    .capture.end-ready { background:var(--green); border-color:var(--green); color:white; }
    .capture.end-ready:hover:not(:disabled) { background:#19523f; }
    .stamp { display:block; font:600 18px/1.45 ui-monospace,Consolas,monospace; white-space:nowrap; }
    .stamp small { display:block; font-size:14px; font-weight:400; color:var(--muted); }
    .duration { font:16px ui-monospace,Consolas,monospace; color:var(--muted); white-space:nowrap; }
    .text-button { padding:5px 0; min-height:40px; border:0; background:transparent; font-size:15px; color:var(--muted); font-weight:500; }
    .text-button:hover:not(:disabled) { background:transparent; text-decoration:underline; }
    .empty { color:#8c978f; font-size:16px; }
    .below { margin-top:15px; color:var(--muted); font-size:15px; }
    details { margin-top:16px; border-top:1px solid var(--line); padding-top:15px; }
    summary { cursor:pointer; font-size:16px; font-weight:600; }
    .audit-list { max-height:280px; overflow:auto; padding:0 0 0 20px; font-size:15px; }
    .audit-list li { padding:7px 0; border-bottom:1px solid var(--line); overflow-wrap:anywhere; }
    .utility { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); align-items:flex-start; }
    .utility p { margin:0; max-width:750px; font-size:14px; color:var(--muted); }
    .utility .actions { flex-shrink:0; }
    .utility button { min-height:40px; padding:7px 12px; font-size:15px; }
    dialog { width:min(510px,calc(100% - 32px)); padding:26px; border:1px solid var(--line); border-radius:12px; color:var(--ink); box-shadow:0 18px 90px #172d2533; }
    dialog::backdrop { background:#20342f55; }
    dialog h2 { margin:0 0 4px; font-size:25px; }
    dialog p { margin:0 0 19px; color:var(--muted); font-size:16px; }
    dialog .field { margin-top:15px; }
    .dialog-actions { justify-content:flex-end; margin-top:23px; }
    #correctionError { color:#a03329; margin-top:12px; }
    #toast { position:fixed; bottom:22px; left:50%; transform:translateX(-50%); padding:10px 20px; border-radius:8px; background:#203e32; color:white; box-shadow:0 5px 22px #20342f22; font-size:16px; z-index:3; }
    #toast[hidden] { display:none; }
    @media(max-width:1000px) { .toolbar{flex-wrap:wrap} .archive select{max-width:310px} .fields{grid-template-columns:1fr 1fr} .order-field{grid-column:1/-1} .timeline{overflow-x:auto} table{min-width:920px} }
    @media(max-width:850px) { main{padding:24px 16px} .masthead{align-items:flex-start} h1{font-size:30px} .clock{min-width:235px;padding-left:18px} .clock-line strong{font-size:22px} td,th{padding-left:12px;padding-right:12px} .task-cell{gap:8px} .step-icon{display:none} }
    @media(max-width:600px) { .masthead,.toolbar,.utility{flex-direction:column;align-items:stretch;gap:15px} .clock{border-left:0;padding-left:0;display:flex;flex-wrap:wrap;gap:0 20px} .clock small{width:100%} .clock-line{gap:5px} .archive select{min-width:0;max-width:none;width:100%} .archive label{display:none} .actions button{flex:1} .metadata,.session-notes{padding:18px} .fields{gap:12px} .progress{font-size:14px} progress{width:125px} .utility .actions{align-self:flex-start} }
    @media print { body{background:white} main{max-width:none;padding:0} button,.toolbar,.utility,dialog,#toast{display:none!important} .panel{border:0} .timeline{overflow:visible} table{min-width:0} .clock{display:none} .metadata{padding:10px 0} .capture{display:none} .sheet-top{margin-top:12px} td{padding-top:7px;padding-bottom:7px} .fields{grid-template-columns:1fr 1fr 1.5fr} }
  </style>
</head>
<body>
<main>
  <header class="masthead">
    <div><p class="eyebrow">LLM × AV STUDY / RESEARCHER RECORD</p><h1>Study record sheet</h1><p class="subtitle">Record each start and end as it happens.</p></div>
    <div class="clock" aria-label="Current device time"><div class="clock-line"><span>LOCAL</span><strong id="localClock">—</strong></div><div class="clock-line"><span>UTC</span><strong id="utcClock">—</strong></div><small id="clockZone"></small></div>
  </header>
  <div class="toolbar">
    <div class="archive"><label for="sessionPicker">Saved sheet</label><select id="sessionPicker" aria-label="Open a saved participant sheet"></select></div>
    <div class="actions"><button id="newParticipant" type="button">+ New participant</button><button id="exportCsv" class="primary" type="button">↓ Export participant CSV</button></div>
  </div>
  <section class="panel metadata" aria-label="Participant information">
    <div class="fields">
      <div class="field"><label for="participantId">Participant ID *</label><input id="participantId" maxlength="64" placeholder="e.g. P001" autocomplete="off" spellcheck="false" pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" required><small>Letters, numbers, underscores or hyphens.</small></div>
      <div class="field"><label for="condition">Interaction condition *</label><select id="condition" required><option value="">Select condition</option><option value="cognitive">Cognitive interaction</option><option value="affective">Affective interaction</option><option value="baseline">Baseline · no agent interaction</option></select><small id="conditionHelp">Required before recording timestamps.</small></div>
      <div class="field order-field"><label for="clipOrder">Clip order / counterbalance code</label><input id="clipOrder" maxlength="500" placeholder="Enter the assigned sequence or order code" autocomplete="off"><small>Clips below are numbered 1–5 in presentation order.</small></div>
    </div>
    <div class="save-line"><span id="saveStatus" role="status">Checking autosave…</span><span id="sheetDate"></span></div>
  </section>
  <div id="storageNotice" class="notice" role="alert" hidden></div>
  <div id="sessionNotice" class="notice" role="status" hidden></div>
  <div class="sheet-top"><h2>Session timeline</h2><div class="progress"><span id="progressText">0 / 32 timestamps</span><progress id="progressBar" value="0" max="32" aria-label="Timestamps recorded"></progress></div></div>
  <section class="panel timeline" aria-label="Study activity timestamps">
    <table><colgroup><col class="activity"><col class="point"><col class="point"><col class="elapsed"><col class="adjust"></colgroup><thead><tr><th scope="col">Activity</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Duration</th><th scope="col"><span aria-label="Corrections">Edit</span></th></tr></thead><tbody id="timelineBody"></tbody></table>
  </section>
  <p class="below">Recorded times show <strong>local time</strong> above UTC. Full dates, milliseconds and timezone offsets are included in the CSV. “Adjust” adds a missed time or corrects a recorded time, with a reason.</p>
  <details><summary id="auditSummary">Timestamp history</summary><ol id="auditList" class="audit-list"></ol></details>
  <section class="panel session-notes" aria-label="Session notes"><div class="field"><label for="notes">Session notes</label><textarea id="notes" maxlength="20000" placeholder="Observations, interruptions, deviations from the procedure…"></textarea></div></section>
  <footer class="utility"><p>Saved in this browser on this device. Export a participant CSV after each session. Keep using the same browser and page address; clearing browser data removes saved sheets. Times follow this device’s clock.</p><div class="actions"><button id="backupButton" type="button">Back up all sheets</button><button id="restoreButton" type="button">Restore backup</button></div></footer>
  <input id="restoreFile" type="file" accept="application/json,.json" hidden>
</main>
<dialog id="correctionDialog" aria-labelledby="correctionTitle"><form id="correctionForm">
  <h2 id="correctionTitle">Adjust a timestamp</h2><p id="correctionActivity"></p>
  <div class="field"><label for="correctionPoint">Timestamp</label><select id="correctionPoint"><option value="start">Start</option><option value="end">End</option></select></div>
  <div class="field"><label for="correctionTime">Corrected time in UTC</label><input id="correctionTime" type="text" required spellcheck="false" placeholder="2026-11-02T14:30:00.000Z"><small>Use YYYY-MM-DDTHH:mm:ss.sssZ. The trailing Z means UTC.</small></div>
  <div class="field"><label for="correctionReason">Reason *</label><textarea id="correctionReason" required maxlength="2000" placeholder="e.g. End button was clicked 10 seconds late."></textarea><small id="originalTime"></small></div>
  <p id="correctionError" role="alert" hidden></p><div class="dialog-actions"><button id="cancelCorrection" type="button">Cancel</button><button type="submit" class="primary">Save correction</button></div>
</form></dialog>
<dialog id="confirmDialog" aria-labelledby="confirmTitle"><form method="dialog"><h2 id="confirmTitle">Confirm action</h2><p id="confirmMessage"></p><div class="dialog-actions"><button type="submit" value="cancel">Cancel</button><button type="submit" value="continue" class="primary">Continue</button></div></form></dialog>
<div id="toast" role="status" hidden></div>
<noscript><p class="notice">Enable JavaScript to record timestamps.</p></noscript>
<script id="record-sheet-script">
(() => {
  'use strict';
  const STORAGE_KEY = 'llm-av-record-sheet-v1';
  const CONDITIONS = ['cognitive', 'affective', 'baseline'];
  const STEPS = [
    {id:'intake', label:'Intake survey', marker:'1', kind:'survey', group:'Before the drive'},
    {id:'agent_interaction', label:'Agent interaction', marker:'2', kind:'agent', group:'Before the drive', agent:true},
    {id:'post_interaction', label:'Post-interaction survey', marker:'3', kind:'survey', group:'Before the drive', agent:true},
    {id:'av_practice', label:'AV practice', marker:'4', kind:'drive', group:'Before the drive'},
    {id:'pre_drive_survey', label:'Post-practice / pre-drive survey', marker:'5', kind:'survey', group:'Before the drive'},
    ...Array.from({length:5}, (_, i) => [
      {id:`clip_${i+1}`, label:`Clip ${i+1}`, marker:String(i+1), kind:'drive', group:'Main AV drive · presentation order', clip:i+1},
      {id:`clip_${i+1}_survey`, label:`Clip ${i+1} survey`, marker:`${i+1}S`, kind:'survey', group:'Main AV drive · presentation order', clip:i+1},
    ]).flat(),
    {id:'post_drive_survey', label:'Post-drive survey', marker:'7', kind:'survey', group:'After the drive'},
  ];
  const pad = (n, width=2) => String(n).padStart(width, '0');
  function timestamp(date=new Date()) {
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid timestamp.');
    const offset = -date.getTimezoneOffset();
    const suffix = `${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset)/60))}:${pad(Math.abs(offset)%60)}`;
    const local = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(),3)}${suffix}`;
    return {utc:date.toISOString(), local, epoch_ms:date.getTime(), timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown', utc_offset_minutes:offset};
  }
  function newSession(now=timestamp()) {
    const id = `${now.epoch_ms.toString(36)}-${Math.random().toString(36).slice(2,10)}`;
    return {id, participantId:'', condition:'', clipOrder:'', notes:'', created:now, updated:now.utc, exportedAt:null,
      activities:Object.fromEntries(STEPS.map(step => [step.id, {start:null, end:null, history:[]}]))};
  }
  function validMetadata(session) {
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session.participantId) && CONDITIONS.includes(session.condition);
  }
  function isSkipped(session, step) { return session.condition === 'baseline' && Boolean(step.agent); }
  function hasTimestamps(session) { return STEPS.some(step => session.activities[step.id].history.length); }
  function recordPoint(session, stepId, field, value, reason='') {
    if (!validMetadata(session)) throw new Error('Enter a valid participant ID and select an interaction condition first.');
    const step = STEPS.find(item => item.id === stepId);
    if (!step || !['start','end'].includes(field)) throw new Error('Unknown activity or timestamp.');
    if (isSkipped(session, step)) throw new Error('This activity is skipped for baseline participants.');
    const row = session.activities[stepId];
    if (row[field] && !reason.trim()) throw new Error('This timestamp is already recorded. Use Adjust to make a correction.');
    if (field === 'end' && !row.start) throw new Error('Record the start before the end.');
    if ((field === 'end' && value.epoch_ms < row.start.epoch_ms) || (field === 'start' && row.end && value.epoch_ms > row.end.epoch_ms)) throw new Error('The end time must be on or after the start time.');
    row.history.push({kind:reason.trim() ? 'manual' : 'click', point:field, previous:row[field], value, recorded_at:reason.trim() ? timestamp() : value, reason:reason.trim()});
    row[field] = value;
    session.updated = timestamp().utc;
  }
  function parseUtc(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error('Use the full UTC format, e.g. 2026-11-02T14:30:00.000Z.');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new Error('Enter a valid calendar date and time.');
    return timestamp(date);
  }
  function status(session, step) {
    if (isSkipped(session, step)) return 'skipped';
    const row = session.activities[step.id];
    return row.end ? 'completed' : row.start ? 'in_progress' : 'not_started';
  }
  function csvCell(value) {
    let text = value == null ? '' : String(value);
    // Keep free text from becoming spreadsheet formulas when the CSV is opened.
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function makeCsv(session, exported=timestamp()) {
    const headers = ['schema_version','session_id','participant_id','interaction_condition','clip_order','session_notes','activity_index','activity_id','activity','clip_position','status','start_utc','start_local','start_epoch_ms','start_timezone','start_utc_offset_minutes','end_utc','end_local','end_epoch_ms','end_timezone','end_utc_offset_minutes','duration_seconds','original_start_utc','original_end_utc','manual_adjustment_count','timestamp_history_json','session_created_utc','exported_utc'];
    const rows = STEPS.map((step, index) => {
      const row = session.activities[step.id];
      const start = row.start, end = row.end;
      const first = point => row.history.find(event => event.point === point)?.value.utc || '';
      return [1,session.id,session.participantId,session.condition,session.clipOrder,session.notes,index+1,step.id,step.label,step.clip || '',status(session,step),
        start?.utc,start?.local,start?.epoch_ms,start?.timezone,start?.utc_offset_minutes,
        end?.utc,end?.local,end?.epoch_ms,end?.timezone,end?.utc_offset_minutes,
        start && end ? ((end.epoch_ms-start.epoch_ms)/1000).toFixed(3) : '',first('start'),first('end'),row.history.filter(event => event.kind === 'manual').length,JSON.stringify(row.history),session.created.utc,exported.utc];
    });
    return '\uFEFF' + [headers,...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  function validateStamp(value) {
    return value && typeof value.utc === 'string' && Number.isFinite(value.epoch_ms) && new Date(value.epoch_ms).toISOString() === value.utc && typeof value.local === 'string' && Date.parse(value.local) === value.epoch_ms && typeof value.timezone === 'string' && Number.isInteger(value.utc_offset_minutes);
  }
  function parseDatabase(raw) {
    const db = JSON.parse(raw);
    if (db.version !== 1 || !Array.isArray(db.sessions) || !db.sessions.length || typeof db.activeId !== 'string') throw new Error('This is not a valid record-sheet backup.');
    const ids = new Set();
    for (const session of db.sessions) {
      if (typeof session.id !== 'string' || ids.has(session.id) || !validateStamp(session.created) || !Number.isFinite(Date.parse(session.updated)) || !['participantId','condition','clipOrder','notes'].every(key => typeof session[key] === 'string') || !['',...CONDITIONS].includes(session.condition) || !session.activities) throw new Error('A saved participant sheet is invalid.');
      ids.add(session.id);
      for (const step of STEPS) {
        const row = session.activities[step.id];
        if (!row || !Array.isArray(row.history) || ![row.start,row.end].every(value => value === null || validateStamp(value)) || (row.end && (!row.start || row.end.epoch_ms < row.start.epoch_ms))) throw new Error('A saved timestamp is invalid.');
        for (const event of row.history) {
          if (!['click','manual'].includes(event.kind) || !['start','end'].includes(event.point) || !validateStamp(event.value) || !validateStamp(event.recorded_at) || !(event.previous === null || validateStamp(event.previous)) || typeof event.reason !== 'string') throw new Error('A timestamp history entry is invalid.');
        }
        for (const point of ['start','end']) {
          const entries = row.history.filter(event => event.point === point);
          if ((row[point] === null) !== (entries.length === 0) || (entries.length && JSON.stringify(row[point]) !== JSON.stringify(entries.at(-1).value))) throw new Error('A timestamp does not match its history.');
        }
        if (isSkipped(session, step) && row.history.length) throw new Error('A baseline sheet contains agent activity timestamps.');
      }
    }
    if (!ids.has(db.activeId)) throw new Error('The active participant sheet is missing.');
    return db;
  }
  const $ = id => document.getElementById(id);
  let database, rawSaved = '', storageBlocked = false, toastTimer;
  try {
    rawSaved = localStorage.getItem(STORAGE_KEY) || '';
    if (rawSaved) database = parseDatabase(rawSaved);
  } catch (error) {
    storageBlocked = true;
    $('storageNotice').textContent = 'Saved sheets could not be loaded. They have not been replaced. Use Back up all sheets to preserve them, or Restore backup to recover a valid backup. Keep this tab open and export any new timestamps.';
    $('storageNotice').hidden = false;
  }
  if (!database) { const session = newSession(); database = {version:1,activeId:session.id,sessions:[session]}; }
  const active = () => database.sessions.find(session => session.id === database.activeId);
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function notify(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function persist() {
    try {
      if (storageBlocked) throw new Error('Saved records need recovery.');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
      $('saveStatus').textContent = '● Saved on this device';
      $('saveStatus').style.color = '';
      $('storageNotice').hidden = true;
      return true;
    } catch (error) {
      $('saveStatus').textContent = 'Autosave unavailable · export your data';
      $('saveStatus').style.color = '#a03329';
      if (!storageBlocked) $('storageNotice').textContent = 'Autosave is unavailable. Keep this tab open and export the participant CSV or a backup now. Use a regular browser window with storage enabled.';
      $('storageNotice').hidden = false;
      return false;
    }
  }
  function refreshPicker() {
    $('sessionPicker').replaceChildren(...database.sessions.map(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = `${session.participantId || 'New participant'} · ${session.condition || 'unassigned'} · ${session.created.local.slice(0,10)}`;
      option.selected = session.id === database.activeId;
      return option;
    }));
  }
  function pointCell(session, step, point) {
    if (isSkipped(session,step)) return '<span class="empty">Not applicable</span>';
    const value = session.activities[step.id][point];
    if (value) return `<time class="stamp" datetime="${escape(value.utc)}" title="${escape(value.local + ' | ' + value.utc + ' | ' + value.timezone)}">${escape(value.local.slice(11,23))}<small>${escape(value.utc.slice(11,23))} UTC</small></time>`;
    const enabled = validMetadata(session) && (point === 'start' || session.activities[step.id].start);
    return `<button type="button" class="capture ${point === 'end' && enabled ? 'end-ready' : ''}" data-step="${step.id}" data-point="${point}" ${enabled ? '' : 'disabled'} aria-label="${point === 'start' ? 'Start' : 'End'} ${escape(step.label)}">${point === 'start' ? 'Start' : 'End'}</button>`;
  }
  function duration(row) {
    if (!row.start || !row.end) return row.start ? 'Running' : '—';
    const seconds = Math.floor((row.end.epoch_ms-row.start.epoch_ms)/1000);
    return `${pad(Math.floor(seconds/60))}:${pad(seconds%60)}`;
  }
  function renderTimeline() {
    const session = active();
    let group = '', html = '', recorded = 0, total = 0;
    for (const step of STEPS) {
      if (group !== step.group) { group = step.group; html += `<tr class="group-row"><th colspan="5" scope="colgroup">${escape(group)}</th></tr>`; }
      const row = session.activities[step.id], state = status(session,step), skipped = state === 'skipped';
      if (!skipped) { total += 2; recorded += Number(Boolean(row.start)) + Number(Boolean(row.end)); }
      const label = {skipped:'Skipped · baseline',completed:'Recorded',in_progress:'In progress',not_started:'Not started'}[state];
      html += `<tr data-kind="${step.kind}" class="${state === 'in_progress' ? 'running' : skipped ? 'skipped' : ''}"><td><div class="task-cell"><span class="step-icon" aria-hidden="true">${step.marker}</span><div><div class="task-name">${escape(step.label)}</div><div class="task-state">${label}</div></div></div></td><td>${pointCell(session,step,'start')}</td><td>${pointCell(session,step,'end')}</td><td class="duration">${skipped ? '—' : duration(row)}</td><td><button class="text-button" type="button" data-adjust="${step.id}" aria-label="Adjust ${escape(step.label)} timestamp" ${skipped || !validMetadata(session) ? 'disabled' : ''}>Adjust</button></td></tr>`;
    }
    $('timelineBody').innerHTML = html;
    $('progressText').textContent = `${recorded} / ${total} timestamps`;
    $('progressBar').max = total;
    $('progressBar').value = recorded;
    $('condition').disabled = hasTimestamps(session);
    $('conditionHelp').textContent = hasTimestamps(session) ? 'Condition locked after the first timestamp.' : 'Required before recording timestamps.';
    $('exportCsv').disabled = !validMetadata(session);
    const running = STEPS.filter(step => status(session,step) === 'in_progress');
    $('sessionNotice').hidden = true;
    if (running.length > 1) { $('sessionNotice').textContent = `${running.length} activities have a start but no end. Check for a missed end timestamp.`; $('sessionNotice').hidden = false; }
    renderHistory();
  }
  function renderHistory() {
    const entries = STEPS.flatMap(step => active().activities[step.id].history.map(event => ({step,...event}))).sort((a,b) => a.recorded_at.epoch_ms-b.recorded_at.epoch_ms);
    $('auditSummary').textContent = `Timestamp history · ${entries.length} entries`;
    $('auditList').replaceChildren(...entries.map(event => {
      const item = document.createElement('li');
      item.textContent = `${event.step.label} / ${event.point}: ${event.value.utc}${event.kind === 'manual' ? ` · adjusted from ${event.previous?.utc || 'not recorded'} · ${event.reason} · edited ${event.recorded_at.utc}` : ' · button click'}`;
      return item;
    }));
  }
  function render() {
    const session = active();
    for (const field of ['participantId','condition','clipOrder','notes']) $(field).value = session[field];
    $('sheetDate').textContent = `Sheet created ${session.created.local.slice(0,10)} · ${session.created.timezone}`;
    refreshPicker(); renderTimeline();
  }
  for (const field of ['participantId','condition','clipOrder','notes']) {
    $(field).addEventListener(field === 'condition' ? 'change' : 'input', () => {
      const session = active();
      if (field === 'condition' && hasTimestamps(session)) { $(field).value = session.condition; return; }
      session[field] = field === 'participantId' ? $(field).value.trim() : $(field).value;
      session.updated = timestamp().utc;
      persist();
      if (['participantId','condition'].includes(field)) { refreshPicker(); renderTimeline(); }
    });
  }
  $('timelineBody').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.adjust) { openCorrection(button.dataset.adjust); return; }
    const clicked = timestamp(); // Capture immediately, before rendering or saving.
    try { recordPoint(active(),button.dataset.step,button.dataset.point,clicked); persist(); renderTimeline(); }
    catch (error) { notify(error.message); }
  });
  function askConfirmation(message) {
    const dialog = $('confirmDialog');
    dialog.returnValue = 'cancel';
    $('confirmMessage').textContent = message;
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'continue'), {once:true});
      dialog.showModal();
    });
  }
  $('newParticipant').addEventListener('click', async () => {
    const session = active();
    if (!session.participantId && !session.clipOrder && !session.notes && !hasTimestamps(session)) { $('participantId').focus(); return; }
    if (!await askConfirmation('Start a new participant sheet? The current sheet will stay saved in the participant list.')) return;
    const next = newSession(); database.sessions.push(next); database.activeId = next.id; persist(); render(); $('participantId').focus();
  });
  $('sessionPicker').addEventListener('change', () => { database.activeId = $('sessionPicker').value; persist(); render(); });
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('exportCsv').addEventListener('click', async () => {
    const session = active();
    if (!validMetadata(session)) return;
    if (!session.clipOrder.trim() && !await askConfirmation('No clip order has been entered. Export the CSV anyway?')) return;
    const exported = timestamp();
    download(makeCsv(session,exported),`${session.participantId}_${session.created.local.slice(0,10)}_${session.id}_timestamps.csv`,'text/csv;charset=utf-8');
    session.exportedAt = exported.utc; persist(); notify('Participant CSV download requested.');
  });
  $('backupButton').addEventListener('click', () => {
    download(storageBlocked && rawSaved ? rawSaved : JSON.stringify(database,null,2),`study_sheets_backup_${timestamp().utc.replace(/[:.]/g,'-')}.json`,'application/json');
    notify('Backup download requested.');
  });
  $('restoreButton').addEventListener('click', () => $('restoreFile').click());
  $('restoreFile').addEventListener('change', async () => {
    const file = $('restoreFile').files[0];
    if (!file) return;
    try {
      if (file.size > 20*1024*1024) throw new Error('The backup is too large (maximum 20 MB).');
      const imported = parseDatabase(await file.text());
      const existing = new Set(database.sessions.map(session => session.id));
      const additions = imported.sessions.filter(session => !existing.has(session.id));
      if (!additions.length) { notify('These sheets are already saved. Existing sheets were kept.'); return; }
      if (!await askConfirmation(`Restore ${additions.length} participant sheet(s)? Existing sheets will be kept.`)) return;
      database.sessions.push(...additions); database.activeId = additions[0].id; storageBlocked = false;
      persist(); render(); notify(`${additions.length} sheet(s) restored.`);
    } catch (error) { notify(`Could not restore backup: ${error.message}`); }
    finally { $('restoreFile').value = ''; }
  });
  let editingStep = null;
  function fillCorrection() {
    const row = active().activities[editingStep], point = $('correctionPoint').value;
    $('correctionTime').value = row[point]?.utc || '';
    $('originalTime').textContent = row[point] ? `Current recorded time: ${row[point].utc}. The original will remain in the history.` : 'No timestamp is recorded yet. This will be logged as a manual entry.';
    $('correctionError').hidden = true;
  }
  function openCorrection(stepId) {
    editingStep = stepId;
    $('correctionActivity').textContent = STEPS.find(step => step.id === stepId).label;
    $('correctionPoint').value = 'start'; $('correctionReason').value = ''; fillCorrection();
    $('correctionDialog').showModal();
  }
  $('correctionPoint').addEventListener('change', fillCorrection);
  $('cancelCorrection').addEventListener('click', () => $('correctionDialog').close());
  $('correctionForm').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const reason = $('correctionReason').value.trim();
      if (!reason) throw new Error('Enter a reason for this correction.');
      const value = parseUtc($('correctionTime').value.trim());
      recordPoint(active(),editingStep,$('correctionPoint').value,value,reason);
      persist(); renderTimeline(); $('correctionDialog').close(); notify('Correction saved. Original timestamp retained.');
    } catch (error) { $('correctionError').textContent = error.message; $('correctionError').hidden = false; }
  });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { database = parseDatabase(event.newValue); $('correctionDialog').close(); render(); notify('Sheets updated from another tab.'); }
    catch (error) { notify('Another tab saved unreadable data. This sheet has been kept.'); }
  });
  function updateClock() {
    const now = timestamp();
    $('localClock').textContent = now.local.slice(11,19);
    $('utcClock').textContent = now.utc.slice(11,19) + 'Z';
    $('clockZone').textContent = `${now.local.slice(0,10)} · ${now.timezone} · UTC${now.local.slice(-6)}`;
  }
  render(); persist(); updateClock(); setInterval(updateClock,1000);
})();
</script>
</body>
</html>
'''
HTML_BYTES = HTML.encode("utf-8")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError) as exc:
        print("Could not open the record sheet: {}".format(exc), file=sys.stderr)
        if sys.stdin is not None and sys.stdin.isatty():
            try:
                input("Press Enter to close...")
            except (EOFError, KeyboardInterrupt):
                pass
        raise SystemExit(1)
