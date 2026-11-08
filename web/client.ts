type Item = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  department: string;
  checked: number;
  revision: number;
  updated_at: string;
};
const departments = [
  'ירקות ופירות',
  'מוצרי חלב וביצים',
  'לחם ומאפים',
  'בשר ודגים',
  'מזווה',
  'קפואים',
  'משקאות',
  'ניקיון וטיפוח',
  'אחר',
];
const units = ['יח׳', 'ק״ג', 'גרם', 'ליטר', 'חבילה', 'קופסה', 'בקבוק'];
const icons = ['◒', '◉', '▰', '◈', '▥', '❄', '◌', '✧', '⋯'];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const dialog = (id: string) => $<HTMLDialogElement>(id);
const state = {
  items: [] as Item[],
  filter: 'all',
  search: '',
  busy: false,
  editing: null as Item | null,
  undo: [] as Array<{ id: string; revision: number }>,
  authMode: '',
  clearSnapshot: [] as Item[],
  loaded: false,
  aiReady: false,
};
let pendingAdd: {
  text: string;
  operationId: string;
  status: HTMLElement;
  mode: 'ai' | 'basic';
} | null = null;
let aiPreference = true;
try {
  aiPreference = localStorage.getItem('agalah-ai-mode') !== 'false';
} catch {}
const useAI = () => state.aiReady && aiPreference;
function updateAIUI() {
  const toggle = $<HTMLInputElement>('ai-toggle');
  toggle.checked = useAI();
  toggle.disabled = !state.aiReady || state.busy;
  $('parser-mode').textContent = useAI() ? 'פענוח חכם · AI' : 'פענוח רגיל';
  $('ai-note').textContent = state.aiReady
    ? 'פענוח הודעות חופשיות, כמויות ומחלקות בעזרת AI. רק הטקסט שנשלח מועבר לניתוח; השימוש נספר במכסה משותפת לשניכם.'
    : 'הפענוח החכם עדיין לא הופעל. אפשר להמשיך להוסיף מוצרים בפענוח הרגיל.';
}
let key = '';
try {
  key = localStorage.getItem('agalah-access') ?? '';
} catch {}
function adoptKey(value: string) {
  key = value;
  try {
    localStorage.setItem('agalah-access', value);
  } catch {}
}
function keyFrom(value: string) {
  try {
    return new URLSearchParams(new URL(value).hash.slice(1)).get('key') ?? value;
  } catch {
    return value;
  }
}
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (hashKey) {
  adoptKey(hashKey);
  history.replaceState(null, '', location.pathname + location.search);
}
function connection(label: string, problem = false) {
  const el = $('connection');
  el.classList.toggle('problem', problem);
  el.querySelector('span')!.textContent = label;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string, undo?: Array<{ id: string; revision: number }>) {
  clearTimeout(toastTimer);
  $('toast-message').textContent = message;
  state.undo = undo ?? [];
  $('undo').hidden = !state.undo.length;
  $('toast').hidden = false;
  toastTimer = setTimeout(
    () => {
      $('toast').hidden = true;
      state.undo = [];
    },
    state.undo.length ? 18000 : 6500,
  );
}
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: {
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('לא הצלחנו להתחבר. נסו שוב בעוד רגע.');
  }
  if (!response.ok) {
    if (response.status === 401) {
      const links = data.authMode === 'links';
      $('auth-form').hidden = !links;
      $('signin-link').hidden = links;
      $('auth-title').textContent = links ? 'נכנסים דרך הקישור האישי' : 'הרשימה שלנו נשארת פרטית';
      $('auth-copy').textContent = links
        ? 'פתחו את קישור הגישה שקיבלתם. אחרי הכניסה, המכשיר יזכור אותו.'
        : 'כדי לפתוח את הרשימה, נכנסים עם חשבון ChatGPT שקיבל הרשאת גישה לאתר.';
      if (!dialog('auth-dialog').open) dialog('auth-dialog').showModal();
    }
    const error = new Error(data.error ?? 'הפעולה לא הושלמה.') as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data;
}
async function refresh(silent = false) {
  if (state.busy || document.hidden || dialog('auth-dialog').open) return;
  try {
    const data = await api('/api/items');
    if (state.busy) return;
    state.authMode = data.authMode;
    state.aiReady = Boolean(data.aiEnabled);
    updateAIUI();
    const changed = JSON.stringify(state.items) !== JSON.stringify(data.items);
    state.items = data.items;
    const first = !state.loaded;
    state.loaded = true;
    if (changed || first) render();
    connection('הרשימה מעודכנת');
    if (state.authMode === 'sites') {
      $('share-note').textContent =
        'באתר הפרטי נדרשת הרשאת גישה נפרדת לכל משתמש. העתקת הכתובת לבדה אינה מעניקה הרשאה.';
      $('share-button').textContent = 'העתקת כתובת האתר';
      $('forget-key').hidden = true;
    }
  } catch (error) {
    connection(navigator.onLine ? 'לא הצלחנו להתחבר' : 'אין חיבור לאינטרנט', true);
    if (!silent && (error as any).status !== 401) toast((error as Error).message);
  } finally {
    $('list').setAttribute('aria-busy', 'false');
    if (!state.loaded) $('list').replaceChildren();
  }
}
function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
const editIcon =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
function render() {
  const purchased = state.items.filter((i) => i.checked).length;
  const pending = state.items.length - purchased;
  $('active-count').textContent = String(pending);
  $('shopping-bar').hidden = state.items.length === 0;
  $('progress-label').textContent = `${purchased} מתוך ${state.items.length} מוצרים בסל`;
  $<HTMLButtonElement>('clear-button').disabled = !purchased || state.busy;
  $('empty').hidden = state.items.length > 0 || !state.loaded;
  $('search-wrap').hidden = state.items.length < 6 && !state.search;
  const visible = state.items.filter(
    (i) =>
      (state.filter === 'all' || (state.filter === 'purchased' ? i.checked : !i.checked)) &&
      i.name.includes(state.search),
  );
  $('no-results').hidden = state.items.length === 0 || visible.length > 0;
  const fragment = document.createDocumentFragment();
  for (const [index, department] of departments.entries()) {
    const items = visible
      .filter((i) => i.department === department)
      .sort((a, b) => a.checked - b.checked || a.updated_at.localeCompare(b.updated_at));
    if (!items.length) continue;
    const section = make('section', 'department');
    const heading = make('h3', 'department-title');
    heading.append(
      make('span', 'dept-icon', icons[index]),
      make('span', '', department),
      make('span', 'dept-count', `${items.length} מוצרים`),
    );
    const card = make('div', 'items-card');
    for (const item of items) {
      const row = make('div', 'item' + (item.checked ? ' purchased' : ''));
      const check = make('button', 'item-check', '✓');
      check.type = 'button';
      check.disabled = state.busy;
      check.setAttribute('aria-label', (item.checked ? 'החזרת ' : 'סימון כנקנה: ') + item.name);
      check.setAttribute('aria-pressed', String(Boolean(item.checked)));
      check.addEventListener('click', () => changeChecked(item));
      const label = make('div', 'item-label');
      label.append(make('span', 'item-name', item.name));
      const quantity = make(
        'span',
        'quantity-badge',
        new Intl.NumberFormat('he-IL', { maximumFractionDigits: 3 }).format(item.quantity) +
          (item.unit === 'יח׳' ? '' : ' ' + item.unit),
      );
      const edit = make('button', 'item-edit');
      edit.type = 'button';
      edit.innerHTML = editIcon;
      edit.disabled = state.busy;
      edit.setAttribute('aria-label', 'עריכת ' + item.name);
      edit.addEventListener('click', () => openEdit(item));
      row.append(check, label, quantity, edit);
      card.append(row);
    }
    section.append(heading, card);
    fragment.append(section);
  }
  $('list').replaceChildren(fragment);
  updateSendButton();
  updateAIUI();
}
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
function hideFeedback() {
  clearTimeout(feedbackTimer);
  $('feedback-panel').hidden = true;
}
function chatMessage(text: string, who: 'user' | 'bot', failed = false) {
  clearTimeout(feedbackTimer);
  const row = make('article', 'message message-' + who + (failed ? ' message-error' : ''));
  if (who === 'bot') {
    const avatar = make('span', 'message-avatar', 'ע');
    avatar.setAttribute('aria-hidden', 'true');
    row.append(avatar);
  }
  const body = make('div', 'message-body');
  body.append(make('div', 'message-bubble', text));
  const status = make('span', 'message-status');
  if (who === 'user') body.append(status);
  row.append(body);
  $('chat-messages').append(row);
  $('feedback-panel').hidden = false;
  requestAnimationFrame(() => {
    $('chat-messages').scrollTop = $('chat-messages').scrollHeight;
  });
  return status;
}
function updateSendButton() {
  $<HTMLButtonElement>('add-button').disabled =
    state.busy || !$<HTMLTextAreaElement>('grocery-input').value.trim();
}
let lastComposerText: string | undefined;
let lastComposerWidth = -1;
let lastComposerHeight = -1;
function saveComposerHeight(height: number) {
  const rounded = Math.ceil(height);
  if (rounded === lastComposerHeight) return;
  lastComposerHeight = rounded;
  document.documentElement.style.setProperty('--composer-height', rounded + 'px');
}
function updateComposer() {
  updateSendButton();
  const input = $<HTMLTextAreaElement>('grocery-input');
  const width = input.clientWidth;
  if (input.value === lastComposerText && width === lastComposerWidth) return;
  lastComposerText = input.value;
  lastComposerWidth = width;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 144) + 'px';
  if (typeof ResizeObserver === 'undefined')
    saveComposerHeight($('composer').getBoundingClientRect().height);
}
$('feedback-dismiss').addEventListener('click', hideFeedback);
async function mutate(
  path: string,
  method: string,
  body: unknown,
  success?: string,
  chatFeedback = false,
) {
  if (state.busy) return;
  if (!chatFeedback) hideFeedback();
  state.busy = true;
  connection(chatFeedback && useAI() ? 'מפענחים את ההודעה…' : 'שומרים…');
  render();
  try {
    const result = await api(path, method, body);
    state.items = result.items;
    render();
    connection('הרשימה מעודכנת');
    if (success) toast(success, result.undo);
    return result;
  } catch (error) {
    if (!chatFeedback) toast((error as Error).message);
    connection(navigator.onLine ? 'השינוי לא נשמר' : 'אין חיבור — השינוי לא נשמר', true);
    if ((error as any).status === 409) {
      state.busy = false;
      await refresh(true);
    }
    throw error;
  } finally {
    state.busy = false;
    render();
  }
}
async function add(text: string) {
  if (state.busy) return;
  const mode = useAI() ? 'ai' : 'basic';
  if (!pendingAdd || pendingAdd.text !== text || pendingAdd.mode !== mode) {
    $('chat-messages').replaceChildren();
    pendingAdd = {
      text,
      operationId: crypto.randomUUID(),
      status: chatMessage(text, 'user'),
      mode,
    };
  } else {
    clearTimeout(feedbackTimer);
    const row = pendingAdd.status.closest('article');
    if (row) $('chat-messages').replaceChildren(row);
    $('feedback-panel').hidden = false;
  }
  const messageStatus = pendingAdd.status;
  messageStatus.textContent = mode === 'ai' ? 'מפענחים…' : 'שולחים…';
  messageStatus.classList.remove('failed');
  const button = $<HTMLButtonElement>('add-button');
  button.disabled = true;
  try {
    const result = await mutate(
      '/api/items',
      'POST',
      { text: pendingAdd.text, operationId: pendingAdd.operationId, mode: pendingAdd.mode },
      undefined,
      true,
    );
    if (!result) return;
    pendingAdd = null;
    const input = $<HTMLTextAreaElement>('grocery-input');
    if (input.value.trim() === text) input.value = '';
    messageStatus.textContent = 'נשמר ✓';
    const reply =
      result.added === 1
        ? 'המוצר עודכן ברשימה המשותפת ✓'
        : `${result.added} מוצרים עודכנו ברשימה המשותפת ✓`;
    chatMessage(reply + (result.warnings?.length ? '\n' + result.warnings.join('\n') : ''), 'bot');
    if (!result.warnings?.length) feedbackTimer = setTimeout(hideFeedback, 6500);
  } catch (error) {
    messageStatus.textContent = 'לא נשמר';
    messageStatus.classList.add('failed');
    chatMessage(
      (error as Error).message + '\nהטקסט נשאר בשורת הכתיבה. אפשר לנסות לשלוח שוב.',
      'bot',
      true,
    );
  } finally {
    updateComposer();
  }
}
$('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $<HTMLTextAreaElement>('grocery-input').value.trim();
  if (text) void add(text);
});
$<HTMLTextAreaElement>('grocery-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!state.busy) $<HTMLFormElement>('add-form').requestSubmit();
  }
});
$('grocery-input').addEventListener('input', updateComposer);
$('add-button').addEventListener('pointerdown', (event) => {
  if (!$<HTMLButtonElement>('add-button').disabled) event.preventDefault();
});
document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) =>
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter!;
    document.querySelectorAll('[data-filter]').forEach((el) => {
      el.classList.toggle('active', el === button);
      el.setAttribute('aria-pressed', String(el === button));
    });
    render();
  }),
);
$<HTMLInputElement>('search').addEventListener('input', (event) => {
  state.search = (event.target as HTMLInputElement).value.trim();
  render();
});
async function changeChecked(item: Item) {
  try {
    await mutate('/api/items/' + item.id, 'PATCH', {
      revision: item.revision,
      checked: !item.checked,
    });
  } catch {}
}
for (const value of units) {
  const option = make('option', '', value);
  option.value = value;
  $('edit-unit').append(option);
}
for (const value of departments) {
  const option = make('option', '', value);
  option.value = value;
  $('edit-department').append(option);
}
function openEdit(item: Item) {
  hideFeedback();
  state.editing = { ...item };
  $<HTMLInputElement>('edit-name').value = item.name;
  $<HTMLInputElement>('edit-quantity').value = String(item.quantity);
  $<HTMLSelectElement>('edit-unit').value = item.unit;
  $<HTMLSelectElement>('edit-department').value = item.department;
  dialog('edit-dialog').showModal();
}
$('edit-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.editing || state.busy) return;
  const save = $<HTMLButtonElement>('save-edit');
  save.disabled = true;
  try {
    await mutate(
      '/api/items/' + state.editing.id,
      'PATCH',
      {
        revision: state.editing.revision,
        name: $<HTMLInputElement>('edit-name').value.trim(),
        quantity: Number($<HTMLInputElement>('edit-quantity').value),
        unit: $<HTMLSelectElement>('edit-unit').value,
        department: $<HTMLSelectElement>('edit-department').value,
      },
      'השינויים נשמרו',
    );
    dialog('edit-dialog').close();
    state.editing = null;
  } catch {
    const latest = state.items.find((i) => i.id === state.editing?.id);
    if (latest) state.editing = { ...latest };
  } finally {
    save.disabled = false;
  }
});
$('delete-item').addEventListener('click', async () => {
  if (!state.editing || state.busy) return;
  try {
    await mutate(
      '/api/items/' + state.editing.id,
      'DELETE',
      { revision: state.editing.revision },
      'המוצר הוסר מהרשימה',
    );
    dialog('edit-dialog').close();
    state.editing = null;
  } catch {}
});
document
  .querySelectorAll<HTMLButtonElement>('[data-close]')
  .forEach((button) =>
    button.addEventListener('click', () => dialog(button.dataset.close!).close()),
  );
$('clear-button').addEventListener('click', () => {
  state.clearSnapshot = state.items.filter((i) => i.checked);
  $('clear-description').textContent =
    `ננקה ${state.clearSnapshot.length} מוצרים שסומנו כנקנו. המוצרים שעדיין צריך לקנות יישארו ברשימה.`;
  dialog('clear-dialog').showModal();
});
$('confirm-clear').addEventListener('click', async () => {
  const button = $<HTMLButtonElement>('confirm-clear');
  button.disabled = true;
  try {
    const result = await mutate('/api/clear', 'POST', {
      items: state.clearSnapshot.map(({ id, revision }) => ({ id, revision })),
    });
    if (result) {
      dialog('clear-dialog').close();
      toast(
        result.skipped
          ? `נוקו ${result.changed} מוצרים. מוצרים שהשתנו נשארו ברשימה.`
          : 'הפריטים שנקנו נוקו. מוכנים לקנייה הבאה!',
        result.undo,
      );
    }
  } catch {
  } finally {
    button.disabled = false;
  }
});
$('undo').addEventListener('click', async () => {
  const undo = [...state.undo];
  if (!undo.length) return;
  try {
    const result = await mutate('/api/restore', 'POST', { items: undo });
    if (result) toast(result.skipped ? 'שוחזרו המוצרים שלא השתנו מאז.' : 'המוצרים חזרו לרשימה');
  } catch {}
});
$('settings').addEventListener('click', () => dialog('settings-dialog').showModal());
$('ai-toggle').addEventListener('change', (event) => {
  aiPreference = (event.target as HTMLInputElement).checked;
  try {
    localStorage.setItem('agalah-ai-mode', String(aiPreference));
  } catch {}
  updateAIUI();
});
$('share-button').addEventListener('click', async () => {
  try {
    const url = state.authMode === 'links' ? (await api('/api/access')).url : location.origin;
    await navigator.clipboard.writeText(url);
    toast('הקישור הועתק');
  } catch (error) {
    toast((error as Error).message || 'לא הצלחנו להעתיק את הקישור.');
  }
});
$('export-button').addEventListener('click', () => {
  const blob = new Blob(
    [JSON.stringify({ exportedAt: new Date().toISOString(), items: state.items }, null, 2)],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = make('a');
  a.href = url;
  a.download = 'רשימת-קניות.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('forget-key').addEventListener('click', () => {
  try {
    localStorage.removeItem('agalah-access');
  } catch {}
  location.reload();
});
$('auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = keyFrom($<HTMLInputElement>('access-key').value.trim());
  if (value.length < 32) {
    $('auth-error').hidden = false;
    $('auth-error').textContent = 'הקישור או המפתח אינם תקינים.';
    return;
  }
  adoptKey(value);
  try {
    const data = await api('/api/items');
    state.items = data.items;
    state.loaded = true;
    state.authMode = data.authMode;
    state.aiReady = Boolean(data.aiEnabled);
    dialog('auth-dialog').close();
    $('auth-error').hidden = true;
    render();
    connection('הרשימה מעודכנת');
  } catch (error) {
    $('auth-error').hidden = false;
    $('auth-error').textContent = (error as Error).message;
  }
});
dialog('auth-dialog').addEventListener('cancel', (event) => event.preventDefault());
window.addEventListener('online', () => void refresh(true));
window.addEventListener('offline', () => connection('אין חיבור לאינטרנט', true));
window.addEventListener('focus', () => void refresh(true));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh(true);
});
let viewportFrame = 0;
let lastViewportHeight = -1;
let lastViewportTop = -1;
function fitViewport() {
  if (viewportFrame) return;
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = 0;
    const viewport = window.visualViewport;
    if (viewport && viewport.scale === 1) {
      const height = Math.round(viewport.height);
      const top = Math.round(viewport.offsetTop);
      if (height !== lastViewportHeight) {
        lastViewportHeight = height;
        document.documentElement.style.setProperty('--app-height', height + 'px');
      }
      if (top !== lastViewportTop) {
        lastViewportTop = top;
        document.documentElement.style.setProperty('--app-top', top + 'px');
      }
    }
  });
}
window.visualViewport?.addEventListener('resize', fitViewport, { passive: true });
window.visualViewport?.addEventListener('scroll', fitViewport, { passive: true });
window.addEventListener(
  'resize',
  () => {
    fitViewport();
    updateComposer();
  },
  { passive: true },
);
if (typeof ResizeObserver !== 'undefined')
  new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) saveComposerHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
  }).observe($('composer'));
updateComposer();
updateAIUI();
fitViewport();
setInterval(() => void refresh(true), 5000);
void refresh();
