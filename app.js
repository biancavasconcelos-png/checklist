// ============================================================
// app.js — Checklist App
// As credenciais ficam em config.js (não versionado).
// Veja o README para configurar no Vercel.
// ============================================================
const SUPABASE_URL      = 'https://lfijpygtgucltzpgrcqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmaWpweWd0Z3VjbHR6cGdyY3FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMDA2NTAsImV4cCI6MjA5NjY3NjY1MH0.d9_NsRUVttVx0DSs1eoc3fZKbFie_FlpfEUmTocWmGE';

// ── Supabase client ──────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── State ────────────────────────────────────────────────────
let tasks = [];
let currentUser = null;
let dragSrc = null;
let filterStatus = 'all';    // all | active | done
let filterPriority = 'all';  // all | low | medium | high
let sortBy = 'position';     // position | due_date | priority | created_at

// ── Auth ─────────────────────────────────────────────────────
// ── Auth ─────────────────────────────────────────────────────
async function signUp() {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-pass').value;
  
    const { error } = await db.auth.signUp({
      email,
      password: pass
    });
  
    if (error) return showAuthError(error.message);
  
    showAuthError('Confirme seu e-mail para entrar!', 'success');
  }
  
  async function signIn() {
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-pass').value;
  
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password: pass
    });
  
    if (error) return showAuthError(error.message);
  
    if (data.session) {
      showApp(data.session.user);
    }
  }
  
  async function signOut() {
    await db.auth.signOut();
  }
  
  function showAuthError(msg, type = 'error') {
    const el = document.getElementById('auth-msg');
    el.textContent = msg;
    el.className = 'auth-msg ' + type;
  }
  
  function showApp(user) {
    currentUser = user;
  
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('app-screen').hidden  = false;
  
    document.getElementById('user-email').textContent = user.email;
  
    loadTasks();
  }
  
  function showLogin() {
    currentUser = null;
  
    document.getElementById('auth-screen').hidden = false;
    document.getElementById('app-screen').hidden  = true;
  
    tasks = [];
    renderTasks();
  }
  
  // Verifica sessão ao carregar a página
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      showApp(data.session.user);
    } else {
      showLogin();
    }
  });
  
  // Reage a login/logout
  db.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showApp(session.user);
    } else {
      showLogin();
    }
  });
// ── CRUD ─────────────────────────────────────────────────────
async function loadTasks() {
  const { data, error } = await db
    .from('tasks')
    .select('*')
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
    .insert({ title, priority, due_date, position, user_id: currentUser.id })
    .select()
    .single();

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

  // Populate modal
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

// ── Drag & Drop reorder ───────────────────────────────────────
function onDragStart(e, id) {
  dragSrc = id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

function onDragOver(e, id) {
  e.preventDefault();
  if (dragSrc === id) return;
  const list = document.getElementById('task-list');
  const items = [...list.querySelectorAll('.task-item:not(.dragging)')];
  const target = list.querySelector(`[data-id="${id}"]`);
  const srcEl  = list.querySelector(`[data-id="${dragSrc}"]`);
  if (!target || !srcEl) return;
  const targetIdx = items.indexOf(target);
  const srcIdx    = items.indexOf(srcEl);
  if (srcIdx < targetIdx) {
    target.after(srcEl);
  } else {
    target.before(srcEl);
  }
}

async function onDrop(e) {
  e.preventDefault();
  // Persist new order
  const list = document.getElementById('task-list');
  const orderedIds = [...list.querySelectorAll('.task-item')].map(el => el.dataset.id);
  const updates = orderedIds.map((id, i) => db.from('tasks').update({ position: i }).eq('id', id));
  await Promise.all(updates);
  orderedIds.forEach((id, i) => {
    const t = tasks.find(t => t.id === id);
    if (t) t.position = i;
  });
  tasks.sort((a, b) => a.position - b.position);
}

// ── Filters & Sort ───────────────────────────────────────────
function setFilter(status) {
  filterStatus = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.filter-btn[data-status="${status}"]`).classList.add('active');
  renderTasks();
}

function setSort(val) {
  sortBy = val;
  renderTasks();
}

function setPriorityFilter(val) {
  filterPriority = val;
  renderTasks();
}

function getFiltered() {
  let list = [...tasks];

  if (filterStatus === 'active') list = list.filter(t => !t.completed);
  if (filterStatus === 'done')   list = list.filter(t => t.completed);

  if (filterPriority !== 'all') list = list.filter(t => t.priority === filterPriority);

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  if (sortBy === 'priority')   list.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  if (sortBy === 'due_date')   list.sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
  if (sortBy === 'created_at') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (sortBy === 'position')   list.sort((a, b) => a.position - b.position);

  return list;
}

// ── Stats ────────────────────────────────────────────────────
function updateStats() {
  const total     = tasks.length;
  const done      = tasks.filter(t => t.completed).length;
  const high      = tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const overdue   = tasks.filter(t => t.due_date && !t.completed && new Date(t.due_date) < new Date()).length;
  const pct       = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-done').textContent    = done;
  document.getElementById('stat-high').textContent    = high;
  document.getElementById('stat-overdue').textContent = overdue;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';
}

// ── Render ───────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
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
         data-id="${task.id}"
         draggable="true"
         ondragstart="onDragStart(event,'${task.id}')"
         ondragend="onDragEnd(event)"
         ondragover="onDragOver(event,'${task.id}')"
         ondrop="onDrop(event)">
      <div class="drag-handle" title="Arrastar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
      </div>
      <button class="check-btn ${task.completed ? 'checked' : ''}" onclick="toggleTask('${task.id}')" aria-label="Marcar como ${task.completed ? 'pendente' : 'concluída'}">
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

// ── Enter key on input ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('task-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addTask();
  });
  document.getElementById('auth-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') signIn();
  });
  // close modal on backdrop click
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
});