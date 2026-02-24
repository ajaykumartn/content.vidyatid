const API_BASE = window.API_BASE || '';

const modules = [
  {
    id: 'reel',
    title: 'Reel Generator',
    description: 'Generate short-form video hooks, scripts, captions, hashtags, and optional SRT.',
    endpoint: '/generate-reel',
    fields: commonFields(['length', 'language']),
  },
  {
    id: 'carousel',
    title: 'Carousel Generator',
    description: 'Create a 6-slide carousel flow with CTA.',
    endpoint: '/generate-carousel',
    fields: commonFields([]),
  },
  {
    id: 'ad',
    title: 'Ad Copy Generator',
    description: 'Build ad assets for Instagram and Google.',
    endpoint: '/generate-ad',
    fields: commonFields(['offer']),
  },
  {
    id: 'social',
    title: 'Social Post Generator',
    description: 'Generate Twitter thread, LinkedIn post, YouTube description, and Telegram copy.',
    endpoint: '/generate-social',
    fields: commonFields([]),
  },
  {
    id: 'calendar',
    title: 'Calendar Generator',
    description: 'Create a 30-day plan with themes and platform suggestions.',
    endpoint: '/generate-calendar',
    fields: commonFields(['month']),
  },
  {
    id: 'study-notes',
    title: 'Study Notes Generator',
    description: 'Turn study material into concise notes and references.',
    endpoint: '/generate-study-notes',
    fields: [
      { key: 'subject', label: 'Subject', type: 'text', required: true },
      { key: 'source_text', label: 'Source Text', type: 'textarea', required: true },
    ],
  },
  {
    id: 'thumbnail',
    title: 'Thumbnail Generator',
    description: 'Generate high-impact thumbnail text and visual hints.',
    endpoint: '/generate-thumbnail',
    fields: commonFields(['platform']),
  },
  {
    id: 'campaign',
    title: 'Campaign Plan Generator',
    description: 'Build a weekly campaign plan with themes and posting rhythm.',
    endpoint: '/generate-campaign-plan',
    fields: commonFields(['duration_weeks', 'budget']),
  },
];

function commonFields(extra = []) {
  const fields = [
    { key: 'brand', label: 'Brand', type: 'text', required: true },
    { key: 'topic', label: 'Topic', type: 'text', required: true },
    { key: 'audience', label: 'Audience', type: 'text', required: true },
    { key: 'tone', label: 'Tone', type: 'text', required: true },
    { key: 'goal', label: 'Goal', type: 'text', required: true },
  ];

  const extras = {
    length: { key: 'length', label: 'Video Length', type: 'text', required: false },
    language: { key: 'language', label: 'Language', type: 'text', required: false },
    offer: { key: 'offer', label: 'Offer', type: 'text', required: false },
    month: { key: 'month', label: 'Month/Range', type: 'text', required: false },
    platform: { key: 'platform', label: 'Platform', type: 'text', required: false },
    duration_weeks: { key: 'duration_weeks', label: 'Duration (weeks)', type: 'number', required: false },
    budget: { key: 'budget', label: 'Budget', type: 'text', required: false },
  };

  extra.forEach((item) => fields.push(extras[item]));
  return fields;
}

function init() {
  const nav = document.getElementById('sidebarNav');
  const root = document.getElementById('formsRoot');
  const template = document.getElementById('moduleTemplate');

  modules.forEach((module) => {
    const navBtn = document.createElement('button');
    navBtn.textContent = module.title;
    navBtn.className = 'block w-full text-left px-3 py-2 rounded bg-slate-800 hover:bg-slate-700';
    navBtn.onclick = () => document.getElementById(`module-${module.id}`).scrollIntoView({ behavior: 'smooth' });
    nav.appendChild(navBtn);

    const node = template.content.firstElementChild.cloneNode(true);
    node.id = `module-${module.id}`;

    node.querySelector('[data-title]').textContent = module.title;
    node.querySelector('[data-description]').textContent = module.description;

    const form = node.querySelector('[data-form]');
    module.fields.forEach((field) => form.appendChild(renderField(field)));

    const loading = node.querySelector('[data-loading]');
    const outputWrap = node.querySelector('[data-output-wrap]');
    const outputPre = node.querySelector('[data-output]');

    node.querySelector('[data-generate]').onclick = async () => {
      try {
        loading.classList.remove('hidden');
        outputWrap.classList.add('hidden');

        const payload = collectFormData(form, module.fields);
        persistDraft(module.id, payload);

        const response = await fetch(`${API_BASE}${module.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Request failed');

        const output = result.output || {};
        outputPre.textContent = JSON.stringify(output, null, 2);

        setupDownloadButtons(node, module, output);
        setupCopyButton(node, outputPre.textContent);

        outputWrap.classList.remove('hidden');
      } catch (error) {
        outputPre.textContent = JSON.stringify({ error: error.message }, null, 2);
        outputWrap.classList.remove('hidden');
      } finally {
        loading.classList.add('hidden');
      }
    };

    form.addEventListener('input', () => persistDraft(module.id, collectFormData(form, module.fields)));
    hydrateDraft(form, module.id, module.fields);

    root.appendChild(node);
  });
}

function renderField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'space-y-1';

  const label = document.createElement('label');
  label.className = 'text-sm font-medium';
  label.textContent = field.label;

  let input;
  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 5;
  } else {
    input = document.createElement('input');
    input.type = field.type;
  }

  input.name = field.key;
  input.required = !!field.required;
  input.className = 'w-full border border-slate-300 rounded p-2 text-sm';

  wrap.append(label, input);
  return wrap;
}

function collectFormData(form, fields) {
  const payload = {};
  fields.forEach((field) => {
    const input = form.querySelector(`[name="${field.key}"]`);
    if (!input) return;

    const value = input.value.trim();
    payload[field.key] = field.type === 'number' && value ? Number(value) : value;
  });
  return payload;
}

function setupCopyButton(node, text) {
  node.querySelector('[data-copy]').onclick = async () => {
    await navigator.clipboard.writeText(text);
  };
}

function setupDownloadButtons(node, module, output) {
  const jsonBtn = node.querySelector('[data-download-json]');
  const srtBtn = node.querySelector('[data-download-srt]');
  const carouselBtn = node.querySelector('[data-download-carousel]');
  const thumbBtn = node.querySelector('[data-download-thumbnail]');

  jsonBtn.onclick = () => downloadFile(`${module.id}-output.json`, JSON.stringify(output, null, 2), 'application/json');

  srtBtn.classList.toggle('hidden', !output.srt_text);
  srtBtn.onclick = () => downloadFile(`${module.id}.srt`, output.srt_text || '', 'text/plain');

  carouselBtn.classList.toggle('hidden', !Array.isArray(output.slides));
  carouselBtn.onclick = () => downloadFile(`${module.id}-slides.txt`, (output.slides || []).join('\n\n'), 'text/plain');

  thumbBtn.classList.toggle('hidden', !output.text || module.id !== 'thumbnail');
  thumbBtn.onclick = () => downloadFile('thumbnail-text.txt', output.text || '', 'text/plain');
}

function downloadFile(fileName, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function persistDraft(moduleId, payload) {
  localStorage.setItem(`vidyatid-${moduleId}`, JSON.stringify(payload));
}

function hydrateDraft(form, moduleId, fields) {
  const raw = localStorage.getItem(`vidyatid-${moduleId}`);
  if (!raw) return;

  try {
    const data = JSON.parse(raw);
    fields.forEach((field) => {
      const input = form.querySelector(`[name="${field.key}"]`);
      if (!input || data[field.key] === undefined || data[field.key] === null) return;
      input.value = data[field.key];
    });
  } catch {
    localStorage.removeItem(`vidyatid-${moduleId}`);
  }
}

init();
