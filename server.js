const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > 100_000) { reject(new Error('Request is too large.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Please send valid JSON.')); }
    });
    req.on('error', reject);
  });
}

async function generateWithGemini(input) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `You are StudySprint, a practical study coach. Make a concise, realistic plan using only the provided syllabus. Never invent syllabus topics. Return ONLY valid JSON with this schema: {"title":string,"summary":string,"topics":[{"name":string,"priority":"High"|"Medium"|"Low","minutes":number,"why":string}],"sessions":[{"day":string,"focus":string,"minutes":number,"tasks":[string]}],"quiz":[{"question":string,"options":[string,string,string,string],"answer":number,"explanation":string}]}. Include 4-8 topics, 3-7 sessions spread before the exam, and 5 multiple-choice questions whose answers are supported by the syllabus text. Balance the available time. Use date labels in the user's locale-neutral YYYY-MM-DD format. If the source text lacks enough facts for meaningful questions, ask conceptual questions tied to the listed terms instead. Do not include markdown fences.\n\nExam date: ${input.examDate}\nStudy minutes per day: ${input.minutesPerDay}\nSyllabus:\n${input.syllabus}`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.35 } }),
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`AI service returned ${response.status}`);
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
  if (!text) throw new Error('AI service returned an empty response.');
  return JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}

function fallbackPlan({ syllabus, examDate, minutesPerDay }) {
  const topics = [...new Set(syllabus.split(/[\n,;•]+/).map(s => s.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(s => s.length > 2))].slice(0, 12);
  if (!topics.length) throw new Error('Add at least one syllabus topic.');
  const end = new Date(`${examDate}T12:00:00`);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = Math.max(1, Math.ceil((end - today) / 86_400_000));
  const sessionCount = Math.min(days, Math.max(1, Math.min(7, topics.length)));
  const sessions = Array.from({ length: sessionCount }, (_, i) => {
    const date = new Date(today); date.setDate(today.getDate() + Math.ceil((i + 1) * days / (sessionCount + 1)));
    const topic = topics[i % topics.length];
    const day = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    return { day, focus: topic, minutes: minutesPerDay, tasks: [`Review the core ideas in ${topic}.`, `Write a short summary from memory.`, 'Finish with a 5-minute self-check.'] };
  });
  const quiz = topics.slice(0, 5).map((topic, i) => ({ question: `Which topic should you review from your syllabus?`, options: [topic, topics[(i + 1) % topics.length], 'A topic not listed in your syllabus', 'None of these'], answer: 0, explanation: `${topic} is included in the syllabus you provided.` }));
  return { title: 'Your focused study plan', summary: `${topics.length} syllabus topics organized into ${sessionCount} focused sessions.`, topics: topics.map((name, i) => ({ name, priority: i < Math.ceil(topics.length / 3) ? 'High' : i < Math.ceil(2 * topics.length / 3) ? 'Medium' : 'Low', minutes: minutesPerDay, why: 'Included in your syllabus; review it and check your recall.' })), sessions, quiz };
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.topics) || !Array.isArray(plan.sessions) || !Array.isArray(plan.quiz)) throw new Error('The plan could not be formatted. Please try again.');
  plan.topics = plan.topics.slice(0, 12).map(t => ({ name: String(t.name || 'Topic').slice(0, 140), priority: ['High', 'Medium', 'Low'].includes(t.priority) ? t.priority : 'Medium', minutes: Math.max(10, Math.min(240, Number(t.minutes) || 30)), why: String(t.why || '').slice(0, 220) }));
  plan.sessions = plan.sessions.slice(0, 10).map(s => ({ day: String(s.day || ''), focus: String(s.focus || 'Review').slice(0, 140), minutes: Math.max(10, Math.min(240, Number(s.minutes) || 30)), tasks: Array.isArray(s.tasks) ? s.tasks.slice(0, 5).map(x => String(x).slice(0, 180)) : [] }));
  plan.quiz = plan.quiz.slice(0, 8).filter(q => Array.isArray(q.options) && q.options.length >= 2).map(q => ({ question: String(q.question || '').slice(0, 300), options: q.options.slice(0, 4).map(o => String(o).slice(0, 160)), answer: Math.max(0, Math.min(q.options.length - 1, Number(q.answer) || 0)), explanation: String(q.explanation || '').slice(0, 300) }));
  return { title: String(plan.title || 'Your study plan').slice(0, 100), summary: String(plan.summary || '').slice(0, 300), topics: plan.topics, sessions: plan.sessions, quiz: plan.quiz };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'POST' && url.pathname === '/api/plan') {
    try {
      const input = await readBody(req);
      if (typeof input.syllabus !== 'string' || input.syllabus.trim().length < 12) return send(res, 400, { error: 'Paste a few syllabus topics (at least 12 characters).'});
      if (input.syllabus.length > 12_000) return send(res, 400, { error: 'Keep the syllabus under 12,000 characters.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.examDate || '') || Number.isNaN(Date.parse(`${input.examDate}T12:00:00`))) return send(res, 400, { error: 'Choose a valid exam date.' });
      const minutesPerDay = Math.max(15, Math.min(240, Number(input.minutesPerDay) || 60));
      let plan, source = 'AI';
      try { plan = await generateWithGemini({ syllabus: input.syllabus.trim(), examDate: input.examDate, minutesPerDay }); }
      catch (err) { console.error('AI generation failed:', err.message); }
      if (!plan) { plan = fallbackPlan({ syllabus: input.syllabus.trim(), examDate: input.examDate, minutesPerDay }); source = 'Smart planner'; }
      return send(res, 200, { ...validatePlan(plan), source });
    } catch (err) {
      return send(res, 400, { error: err.message || 'Could not create a plan.' });
    }
  }
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    send(res, 200, data, mime[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(port, '0.0.0.0', () => console.log(`StudySprint listening on ${port}`));
