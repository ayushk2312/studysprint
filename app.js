const $ = selector => document.querySelector(selector);
const form = $('#planForm');
const syllabus = $('#syllabus');
const dateInput = $('#examDate');
const STORAGE_KEY = 'studysprint-plan-v1';
let currentPlan = null;
let completed = new Set();
let toastTimer;

function localDateString(date) {
  const y = date.getFullYear();
  return `${y}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
const today = new Date();
$('#todayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday:'short', month:'short', day:'numeric' }).format(today);
const defaultExam = new Date(today); defaultExam.setDate(defaultExam.getDate()+7);
dateInput.min = localDateString(today);
dateInput.value = localDateString(defaultExam);

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function updateCharCount() { $('#charCount').textContent = syllabus.value.length.toLocaleString(); }
syllabus.addEventListener('input', updateCharCount);

$('#sampleButton').addEventListener('click', () => {
  syllabus.value = 'Cell structure and function\nPhotosynthesis and cellular respiration\nDNA, genes, and inheritance\nEvolution and natural selection\nEcosystems and energy flow';
  updateCharCount(); syllabus.focus(); showToast('Sample syllabus added. Make it yours!');
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const error = $('#formError'); error.hidden = true;
  const button = $('#generateButton'); button.disabled = true;
  button.querySelector('span:first-child').textContent = 'Building your plan…';
  try {
    const response = await fetch('/api/plan', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ syllabus:syllabus.value, examDate:dateInput.value, minutesPerDay:Number($('#minutesPerDay').value) }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not make a plan.');
    currentPlan = payload; completed = new Set(); saveState(); renderPlan(payload); $('#results').hidden = false;
    $('#results').scrollIntoView({ behavior:'smooth', block:'start' });
  } catch (err) {
    error.textContent = err.message || 'Something went wrong. Please try again.'; error.hidden = false;
  } finally {
    button.disabled = false; button.querySelector('span:first-child').textContent = 'Make my study plan';
  }
});

function readableDate(value) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined,{weekday:'short',month:'short',day:'numeric'}).format(date);
}
function renderPlan(plan) {
  $('#planTitle').textContent = plan.title || 'Your study plan';
  $('#planSummary').textContent = plan.summary || '';
  $('#sourceBadge').textContent = plan.source === 'AI' ? '✦ AI-GENERATED' : '✦ SMART PLAN';
  $('#topicStat').textContent = plan.topics.length;
  $('#timeStat').textContent = Number($('#minutesPerDay').value);
  $('#sessionCount').textContent = `${plan.sessions.length} session${plan.sessions.length === 1 ? '' : 's'}`;
  $('#sessionList').innerHTML = plan.sessions.map((session,index) => {
    const done = completed.has(index);
    return `<article class="session-item ${done?'done':''}"><button class="check-button" data-session="${index}" aria-label="${done?'Mark session incomplete':'Mark session complete'}" aria-pressed="${done}">${done?'✓':''}</button><div class="session-info"><div class="session-meta"><span class="session-date">${escapeHTML(readableDate(session.day))}</span><span>·</span><span>Session ${index+1}</span></div><strong>${escapeHTML(session.focus)}</strong><ul>${(session.tasks||[]).map(task=>`<li>${escapeHTML(task)}</li>`).join('')}</ul></div><span class="session-minutes">${Number(session.minutes)||30} min</span></article>`;
  }).join('');
  $('#topicList').innerHTML = plan.topics.map(topic => `<article class="topic-item"><span class="topic-dot"></span><div class="topic-copy"><strong>${escapeHTML(topic.name)}</strong><span>${escapeHTML(topic.why || 'Review the main ideas and check your recall.')}</span></div><span class="priority ${(topic.priority||'Medium').toLowerCase()}">${escapeHTML(topic.priority||'Medium')}</span></article>`).join('');
  $('#sessionList').querySelectorAll('[data-session]').forEach(button => button.addEventListener('click', () => {
    const index=Number(button.dataset.session); completed.has(index)?completed.delete(index):completed.add(index); saveState(); renderPlan(currentPlan);
  }));
  updateProgress();
  $('#quizContent').hidden = true; $('#quizContent').innerHTML = ''; $('#startQuiz').disabled = false; $('#startQuiz').innerHTML = 'Take the quiz <span class="button-arrow">↗</span>';
}
function updateProgress() {
  const total = currentPlan?.sessions.length || 0;
  const percent = total ? Math.round(completed.size/total*100) : 0;
  $('#progressStat').textContent = percent; $('#progressBar').style.width = `${percent}%`;
  $('#completionRing').style.background = `conic-gradient(#58b38c ${percent*3.6}deg,#eeeff2 ${percent*3.6}deg)`;
  $('#ringNumber').textContent = `${percent}%`;
}

$('#startQuiz').addEventListener('click', () => {
  if (!currentPlan?.quiz?.length) return;
  const container=$('#quizContent'); container.hidden=false;
  container.innerHTML = currentPlan.quiz.map((q,index)=>`<div class="quiz-question" data-question="${index}"><h4>${index+1}. ${escapeHTML(q.question)}</h4><div class="quiz-options">${q.options.map((option,i)=>`<button class="quiz-option" data-option="${i}">${escapeHTML(option)}</button>`).join('')}</div><p class="quiz-explanation" hidden>${escapeHTML(q.explanation||'')}</p></div>`).join('') + '<div class="quiz-score" id="quizScore" hidden></div>';
  $('#startQuiz').disabled = true; $('#startQuiz').textContent = 'Quiz in progress';
  container.querySelectorAll('.quiz-question').forEach(question=>{
    const index=Number(question.dataset.question), correct=Number(currentPlan.quiz[index].answer);
    question.querySelectorAll('.quiz-option').forEach(button=>button.addEventListener('click',()=>{
      if(question.dataset.answered) return; question.dataset.answered='true';
      const selected=Number(button.dataset.option); button.classList.add(selected===correct?'correct':'incorrect');
      question.querySelectorAll('.quiz-option').forEach((choice,i)=>{choice.disabled=true;if(i===correct)choice.classList.add('correct');});
      question.querySelector('.quiz-explanation').hidden=false;
      if(container.querySelectorAll('.quiz-question[data-answered="true"]').length===currentPlan.quiz.length){
        const score=container.querySelectorAll('.quiz-question .quiz-option.correct:not(.incorrect)').length;
        const summary=container.querySelector('#quizScore'); summary.hidden=false; summary.textContent=`You got ${score} out of ${currentPlan.quiz.length}. Every check is a chance to learn.`;
        $('#startQuiz').disabled=false; $('#startQuiz').textContent='Try the quiz again'; $('#startQuiz').onclick=()=>{ $('#startQuiz').onclick=null; $('#startQuiz').dispatchEvent(new Event('click')); };
      }
    }));
  });
});

function saveState() {
  if (!currentPlan) return;
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({plan:currentPlan,completed:[...completed],syllabus:syllabus.value,examDate:dateInput.value,minutesPerDay:$('#minutesPerDay').value})); } catch { showToast('Plan is ready, but browser storage is unavailable.'); }
}
function loadState() {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if (!saved?.plan?.topics || !saved.plan.sessions) return;
    currentPlan=saved.plan; completed=new Set(saved.completed||[]);
    syllabus.value=saved.syllabus||''; updateCharCount();
    if(saved.examDate) dateInput.value=saved.examDate;
    if(saved.minutesPerDay) $('#minutesPerDay').value=saved.minutesPerDay;
    renderPlan(currentPlan); $('#results').hidden=false;
  } catch { localStorage.removeItem(STORAGE_KEY); }
}
$('#resetButton').addEventListener('click',()=>{
  currentPlan=null; completed=new Set(); localStorage.removeItem(STORAGE_KEY); $('#results').hidden=true; syllabus.value=''; updateCharCount(); form.reset(); $('#minutesPerDay').value='60'; dateInput.value=localDateString(defaultExam); $('#formError').hidden=true; window.scrollTo({top:0,behavior:'smooth'}); showToast('Ready for a fresh start.');
});
$('#copyButton').addEventListener('click',async()=>{
  if(!currentPlan)return;
  const text=[currentPlan.title,currentPlan.summary,'',...currentPlan.sessions.map((s,i)=>`${i+1}. ${readableDate(s.day)} — ${s.focus} (${s.minutes} min)\n${(s.tasks||[]).map(t=>`   • ${t}`).join('\n')}`)].join('\n');
  try{await navigator.clipboard.writeText(text);showToast('Study plan copied to clipboard.');}catch{showToast('Clipboard access was blocked by your browser.');}
});
loadState();
