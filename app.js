// ============================================================
// app.js — Checklist Pré-Cirúrgico por Paciente
// ============================================================
const SUPABASE_URL      = 'https://lfijpygtgucltzpgrcqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaWpweWd0Z3VjbHR6cGdyY3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDA2NTAsImV4cCI6MjA5NjY3NjY1MH0.d9_NsRUVttVx0DSs1eoc3fZKbFie_FlpfEUmTocWmGE';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
let tasks        = [];
let patients     = [];
let currentUser  = null;
let currentPatient = null;
let dragSrc      = null;
let filterStatus   = 'all';
let filterPriority = 'all';
let sortBy         = 'position';

// ── Auth ─────────────────────────────────────────────────────
async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) return showAuthError(error.message);
  if (data.session) showApp(data.session.user);
}

async function signOut() {
  await db.auth.signOut();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-msg');
  el.textContent = msg;
  el.className = 'auth-msg error';
}

function showApp(user) {
  currentUser = user;
  document.getElementById('auth-screen').hidden    = true;
  document.getElementById('patient-screen').hidden = false;
  document.getElementById('app-screen').hidden     = true;
  document.getElementById('user-email').textContent = user.email;
  loadPatients();
}

function showLogin() {
  currentUser    = null;
  currentPatient = null;
  document.getElementById('auth-screen').hidden    = false;
  document.getElementById('patient-screen').hidden = true;
  document.getElementById('app-screen').hidden     = true;
  tasks = []; patients = [];
}

db.auth.getSession().then(({ data }) => {
  if (data.session) showApp(data.session.user); else showLogin();
});
db.auth.onAuthStateChange((_e, session) => {
  if (session) showApp(session.user); else showLogin();
});

// ── Patients CRUD ─────────────────────────────────────────────
async function loadPatients() {
  const { data, error } = await db.from('patients').select('*').order('created_at', { ascending: false });
  if (error) return console.error(error);
  patients = data ?? [];
  renderPatients();
}

async function addPatient() {
  const name       = document.getElementById('patient-name').value.trim();
  const prontuario = document.getElementById('patient-pron').value.trim();
  if (!name || !prontuario) return;

  const { data, error } = await db
    .from('patients')
    .insert({ name, prontuario, user_id: currentUser.id })
    .select().single();

  if (error) return console.error(error);
  patients.unshift(data);
  document.getElementById('patient-name').value = '';
  document.getElementById('patient-pron').value = '';
  renderPatients();
}

async function deletePatient(id) {
  if (!confirm('Deletar paciente e todas as suas tarefas?')) return;
  const { error } = await db.from('patients').delete().eq('id', id);
  if (error) return console.error(error);
  patients = patients.filter(p => p.id !== id);
  renderPatients();
}

function openPatient(id) {
  currentPatient = patients.find(p => p.id === id);
  if (!currentPatient) return;
  document.getElementById('patient-screen').hidden = true;
  document.getElementById('app-screen').hidden     = false;
  document.getElementById('patient-label').textContent =
    `${currentPatient.name} · Pront. ${currentPatient.prontuario}`;
  filterStatus = 'all'; filterPriority = 'all'; sortBy = 'position';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-btn[data-status="all"]').classList.add('active');
  loadTasks();
}

function backToPatients() {
  currentPatient = null;
  tasks = [];
  document.getElementById('app-screen').hidden     = true;
  document.getElementById('patient-screen').hidden = false;
}

function renderPatients() {
  const list = document.getElementById('patient-list');
  if (!patients.length) {
    list.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
      <p>Nenhum paciente cadastrado.</p>
    </div>`;
    return;
  }
  list.innerHTML = patients.map(p => `
    <div class="patient-item" onclick="openPatient('${p.id}')">
      <div class="patient-info">
        <span class="patient-name">${escapeHtml(p.name)}</span>
        <span class="patient-pron">Prontuário: ${escapeHtml(p.prontuario)}</span>
      </div>
      <div class="patient-actions" onclick="event.stopPropagation()">
        <button class="icon-btn danger" onclick="deletePatient('${p.id}')" title="Deletar paciente">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
        <button class="icon-btn" title="Abrir checklist">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ── Tasks CRUD ───────────────────────────────────────────────
async function loadTasks() {
  const { data, error } = await db
    .from('tasks').select('*')
    .eq('patient_id', currentPatient.id)
    .order('position', { ascending: true });
  if (error) return console.error(error);
  tasks = data ?? [];
  renderTasks();
  updateStats();
}

async function addTask() {
  const title = document.getElementById('task-input').value.trim();
  if (!title) return;
  const priority = document.getElementById('task-priority').value;
  const due_date = document.getElementById('task-due').value || null;
  const position = tasks.length ? Math.max(...tasks.map(t => t.position)) + 1 : 0;

  const { data, error } = await db
    .from('tasks')
    .insert({ title, priority, due_date, position, user_id: currentUser.id, patient_id: currentPatient.id })
    .select().single();

  if (error) return console.error(error);
  tasks.push(data);
  document.getElementById('task-input').value = '';
  document.getElementById('task-due').value = '';
  renderTasks();
  updateStats();
}

async function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const completed = !task.completed;
  const { error } = await db.from('tasks').update({ completed }).eq('id', id);
  if (error) return console.error(error);
  task.completed = completed;
  renderTasks();
  updateStats();
}

async function deleteTask(id) {
  const { error } = await db.from('tasks').delete().eq('id', id);
  if (error) return console.error(error);
  tasks = tasks.filter(t => t.id !== id);
  renderTasks();
  updateStats();
}

async function clearCompleted() {
  const ids = tasks.filter(t => t.completed).map(t => t.id);
  if (!ids.length) return;
  const { error } = await db.from('tasks').delete().in('id', ids);
  if (error) return console.error(error);
  tasks = tasks.filter(t => !t.completed);
  renderTasks();
  updateStats();
}

async function startEditTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  document.getElementById('edit-id').value       = id;
  document.getElementById('edit-title').value    = task.title;
  document.getElementById('edit-priority').value = task.priority;
  document.getElementById('edit-due').value      = task.due_date ?? '';
  document.getElementById('edit-modal').classList.add('open');
}

async function saveEdit() {
  const id       = document.getElementById('edit-id').value;
  const title    = document.getElementById('edit-title').value.trim();
  const priority = document.getElementById('edit-priority').value;
  const due_date = document.getElementById('edit-due').value || null;
  if (!title) return;
  const { error } = await db.from('tasks').update({ title, priority, due_date }).eq('id', id);
  if (error) return console.error(error);
  const task = tasks.find(t => t.id === id);
  Object.assign(task, { title, priority, due_date });
  closeModal();
  renderTasks();
}

function closeModal() {
  document.getElementById('edit-modal').classList.remove('open');
}

// ── Drag & Drop ──────────────────────────────────────────────
function onDragStart(e, id) {
  dragSrc = id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function onDragEnd(e) { e.currentTarget.classList.remove('dragging'); }
function onDragOver(e, id) {
  e.preventDefault();
  if (dragSrc === id) return;
  const list = document.getElementById('task-list');
  const target = list.querySelector(`[data-id="${id}"]`);
  const srcEl  = list.querySelector(`[data-id="${dragSrc}"]`);
  if (!target || !srcEl) return;
  const items = [...list.querySelectorAll('.task-item:not(.dragging)')];
  if (items.indexOf(srcEl) < items.indexOf(target)) target.after(srcEl);
  else target.before(srcEl);
}
async function onDrop(e) {
  e.preventDefault();
  const list = document.getElementById('task-list');
  const orderedIds = [...list.querySelectorAll('.task-item')].map(el => el.dataset.id);
  await Promise.all(orderedIds.map((id, i) => db.from('tasks').update({ position: i }).eq('id', id)));
  orderedIds.forEach((id, i) => { const t = tasks.find(t => t.id === id); if (t) t.position = i; });
  tasks.sort((a, b) => a.position - b.position);
}

// ── Filters & Sort ───────────────────────────────────────────
function setFilter(status) {
  filterStatus = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-btn[data-status="${status}"]`).classList.add('active');
  renderTasks();
}
function setSort(val)           { sortBy = val;         renderTasks(); }
function setPriorityFilter(val) { filterPriority = val; renderTasks(); }

function getFiltered() {
  let list = [...tasks];
  if (filterStatus   === 'active') list = list.filter(t => !t.completed);
  if (filterStatus   === 'done')   list = list.filter(t => t.completed);
  if (filterPriority !== 'all')    list = list.filter(t => t.priority === filterPriority);
  const po = { high: 0, medium: 1, low: 2 };
  if (sortBy === 'priority')   list.sort((a, b) => po[a.priority] - po[b.priority]);
  if (sortBy === 'due_date')   list.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1; if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
  if (sortBy === 'created_at') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sortBy === 'position')   list.sort((a, b) => a.position - b.position);
  return list;
}

// ── Stats ────────────────────────────────────────────────────
function updateStats() {
  const total   = tasks.length;
  const done    = tasks.filter(t => t.completed).length;
  const high    = tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const overdue = tasks.filter(t => t.due_date && !t.completed && new Date(t.due_date) < new Date()).length;
  const pct     = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-done').textContent    = done;
  document.getElementById('stat-high').textContent    = high;
  document.getElementById('stat-overdue').textContent = overdue;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';
}

// ── Render Tasks ─────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function isOverdue(dateStr, completed) {
  if (!dateStr || completed) return false;
  return new Date(dateStr + 'T00:00:00') < new Date(new Date().toDateString());
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const filtered = getFiltered();
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
      <p>Nenhuma tarefa aqui ainda.</p>
    </div>`;
    return;
  }
  list.innerHTML = filtered.map(task => {
    const overdue = isOverdue(task.due_date, task.completed);
    const priorityLabel = { low: 'Baixa', medium: 'Média', high: 'Alta' }[task.priority];
    return `
    <div class="task-item ${task.completed ? 'done' : ''} priority-${task.priority}"
         data-id="${task.id}" draggable="true"
         ondragstart="onDragStart(event,'${task.id}')"
         ondragend="onDragEnd(event)"
         ondragover="onDragOver(event,'${task.id}')"
         ondrop="onDrop(event)">
      <div class="drag-handle" title="Arrastar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>
      <button class="check-btn ${task.completed ? 'checked' : ''}" onclick="toggleTask('${task.id}')">
        ${task.completed ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
      </button>
      <div class="task-body">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <div class="task-meta">
          <span class="badge priority-badge ${task.priority}">${priorityLabel}</span>
          ${task.due_date ? `<span class="badge due-badge ${overdue ? 'overdue' : ''}">${overdue ? '⚠ ' : ''}${formatDate(task.due_date)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="icon-btn" onclick="startEditTask('${task.id}')" title="Editar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteTask('${task.id}')" title="Deletar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  document.getElementById('auth-pass').addEventListener('keydown',  e => { if (e.key === 'Enter') signIn(); });
  document.getElementById('patient-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('patient-pron').focus(); });
  document.getElementById('patient-pron').addEventListener('keydown', e => { if (e.key === 'Enter') addPatient(); });
  document.getElementById('edit-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
});