const test = require('node:test');
const assert = require('node:assert/strict');
const planHandler = require('../api/plan');

function makeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; },
    json() { return JSON.parse(this.body); }
  };
}

function request(body, method = 'POST') {
  return { method, body };
}

test('creates a fallback study plan from a valid syllabus', async () => {
  const response = makeResponse();
  const future = new Date();
  future.setDate(future.getDate() + 4);
  const examDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;

  await planHandler(request({ syllabus: 'Cell biology\nPhotosynthesis\nGenetics', examDate, minutesPerDay: 45 }), response);

  assert.equal(response.statusCode, 200);
  const plan = response.json();
  assert.equal(plan.source, 'Smart planner');
  assert.equal(plan.topics.length, 3);
  assert.ok(plan.sessions.length > 0);
  assert.equal(plan.sessions[0].minutes, 45);
  assert.equal(plan.quiz.length, 3);
  assert.match(plan.sessions[0].day, /^\d{4}-\d{2}-\d{2}$/);
});

test('rejects a syllabus that is too short', async () => {
  const response = makeResponse();
  await planHandler(request({ syllabus: 'AI', examDate: '2026-12-01' }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /at least 12 characters/i);
});

test('rejects an invalid exam date', async () => {
  const response = makeResponse();
  await planHandler(request({ syllabus: 'Cell biology and genetics', examDate: 'not-a-date' }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /valid exam date/i);
});

test('rejects requests that are not POST', async () => {
  const response = makeResponse();
  await planHandler(request({}, 'GET'), response);

  assert.equal(response.statusCode, 405);
  assert.match(response.json().error, /use post/i);
});
