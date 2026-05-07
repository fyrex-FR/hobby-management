#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.OPENCLAW_VISION_HOST || '0.0.0.0';
const PORT = Number(process.env.OPENCLAW_VISION_PORT || 18890);
const TOKEN = process.env.OPENCLAW_VISION_TOKEN || '';
const MODEL = process.env.OPENCLAW_VISION_MODEL || 'openai-codex/gpt-5.5';
const TIMEOUT_MS = Number(process.env.OPENCLAW_VISION_TIMEOUT_MS || 180000);

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) reject(new Error('Body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function decodeBase64Image(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('missing image base64');
  const raw = value.startsWith('data:') && value.includes(',') ? value.split(',', 2)[1] : value;
  return Buffer.from(raw, 'base64');
}

function stripFence(text) {
  let raw = String(text || '').trim();
  if (raw.startsWith('```')) {
    raw = raw.split('```')[1] || raw;
    if (raw.startsWith('json')) raw = raw.slice(4);
    raw = raw.trim();
  }
  return raw;
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return out;
  }
  if (value && typeof value === 'object') {
    // Prefer likely model-output fields before walking metadata fields.
    for (const key of ['result', 'text', 'content', 'description', 'output', 'message']) {
      if (key in value) collectStrings(value[key], out);
    }
    for (const [key, item] of Object.entries(value)) {
      if (!['result', 'text', 'content', 'description', 'output', 'message'].includes(key)) {
        collectStrings(item, out);
      }
    }
  }
  return out;
}

function tryParseCardJson(text) {
  const raw = stripFence(text);
  try { return JSON.parse(raw); } catch {}

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  throw new Error('No JSON object found in model output');
}

function looksLikeCardResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ['player', 'team', 'year', 'brand', 'set', 'parallel', 'card_number', 'card_type'].some(key => key in value);
}

function extractResult(stdout) {
  const raw = stdout.trim();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return tryParseCardJson(raw); }

  if (looksLikeCardResult(payload)) return payload;

  const candidates = collectStrings(payload);
  for (const text of candidates) {
    try {
      const parsed = tryParseCardJson(text);
      if (looksLikeCardResult(parsed)) return parsed;
    } catch {}
  }

  throw new Error(`Could not find card JSON in OpenClaw output; top-level keys=${payload && typeof payload === 'object' ? Object.keys(payload).join(',') : typeof payload}`);
}

function runOpenClaw(frontPath, backPath, prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      'infer', 'image', 'describe-many',
      '--file', frontPath,
      '--file', backPath,
      '--model', MODEL,
      '--prompt', prompt,
      '--json',
      '--timeout-ms', String(TIMEOUT_MS),
    ];

    const child = spawn('openclaw', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`OpenClaw timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS + 10000);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error((stderr || stdout || `openclaw exited ${code}`).slice(-1500)));
      else resolve(stdout);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, model: MODEL });
    }
    if (req.method !== 'POST' || req.url !== '/identify') {
      return send(res, 404, { error: 'not_found' });
    }
    if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
      return send(res, 401, { error: 'unauthorized' });
    }

    const started = Date.now();
    log('POST /identify start', { remote: req.socket.remoteAddress });
    const body = await readJson(req);
    const tmp = await mkdtemp(join(tmpdir(), 'card-openclaw-'));
    try {
      const front = join(tmp, 'front.jpg');
      const back = join(tmp, 'back.jpg');
      await writeFile(front, decodeBase64Image(body.front_base64));
      await writeFile(back, decodeBase64Image(body.back_base64));

      const prompt = `${body.system_prompt || ''}\n\nYou receive two images: image 1 is the FRONT of the card, image 2 is the BACK. Return ONLY the final JSON object, no markdown.`;
      const stdout = await runOpenClaw(front, back, prompt);
      const result = extractResult(stdout);
      log('POST /identify ok', { latency_ms: Date.now() - started, keys: result && typeof result === 'object' ? Object.keys(result) : [] });
      return send(res, 200, { result, cost_usd: 0 });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  } catch (err) {
    log('POST /identify error', String(err?.message || err));
    return send(res, 502, { error: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  log(`OpenClaw vision proxy listening on http://${HOST}:${PORT} using ${MODEL}`);
});
