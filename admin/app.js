/**
 * Scalderhurst CMS — admin SPA
 * ==============================================================
 * Vanilla ES modules. No build step. No framework.
 *
 * Responsibilities:
 *   - Auth: login, check session, logout (via /api/login, /api/me, /api/logout)
 *   - List: fetch and render /api/posts
 *   - Edit: form + TipTap rich editor
 *   - Save: POST new post or PUT existing post
 *   - Delete: DELETE with confirm
 *   - Uploads: cover + inline images via /api/uploads
 *
 * TipTap is loaded from esm.sh — same CDN family as Google Fonts used
 * by the public site. No subscription, no account, just hosted files.
 */

import { Editor } from 'https://esm.sh/@tiptap/core@2.6.6';
import StarterKit from 'https://esm.sh/@tiptap/starter-kit@2.6.6?deps=@tiptap/core@2.6.6';
import Link from 'https://esm.sh/@tiptap/extension-link@2.6.6?deps=@tiptap/core@2.6.6';
import ImageExt from 'https://esm.sh/@tiptap/extension-image@2.6.6?deps=@tiptap/core@2.6.6';
import Placeholder from 'https://esm.sh/@tiptap/extension-placeholder@2.6.6?deps=@tiptap/core@2.6.6';

// ---------- State ---------------------------------------------

const CATEGORIES = [
  { value: 'company-updates', label: 'Company Updates' },
  { value: 'industry-insights', label: 'Industry Insights' },
  { value: 'stock-offers', label: 'Stock & Offers' },
];

const state = {
  session: null,        // { email } or null
  view: 'loading',      // 'loading' | 'login' | 'list' | 'edit'
  posts: [],
  listLoading: false,
  currentPost: null,    // { filename, sha, frontmatter, body } when editing
  editor: null,         // TipTap Editor instance
};

const root = document.getElementById('app');

// ---------- Utils ---------------------------------------------

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    ...opts,
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(msg, type = 'info', duration = 3500) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') node.innerHTML = v;
    else if (k === 'checked' || k === 'disabled' || k === 'required') node[k] = !!v;
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function categoryLabel(value) {
  const c = CATEGORIES.find((x) => x.value === value);
  return c ? c.label : value;
}

/**
 * Convert a File to { dataBase64, contentType, filename } for upload.
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve({
        dataBase64: comma > -1 ? result.slice(comma + 1) : result,
        contentType: file.type,
        filename: file.name,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ---------- Views ---------------------------------------------

function mount(node) {
  root.innerHTML = '';
  root.appendChild(node);
}

function topbar() {
  return el('header', { class: 'topbar' }, [
    el('div', { class: 'topbar__brand' }, [
      el('span', {}, 'Scalderhurst CMS'),
    ]),
    el('div', { class: 'topbar__user' }, [
      el('span', {}, state.session && state.session.email ? state.session.email : ''),
      el('button', {
        class: 'btn btn--ghost btn--small',
        onclick: handleLogout,
      }, 'Log out'),
    ]),
  ]);
}

function renderLoading() {
  mount(el('div', { class: 'login' }, [
    el('div', { class: 'panel', style: { textAlign: 'center' } }, [
      el('p', { style: { color: 'var(--admin-text-muted)' } }, 'Loading…'),
    ]),
  ]));
}

function renderLogin() {
  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      const email = form.querySelector('[name="email"]').value.trim();
      const password = form.querySelector('[name="password"]').value;
      const submitBtn = form.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
      try {
        await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await bootstrap();
      } catch (err) {
        toast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      }
    },
  }, [
    el('h1', {}, 'Sign in to the CMS'),
    el('div', { class: 'form-row' }, [
      el('label', { for: 'email' }, 'Email'),
      el('input', { type: 'email', name: 'email', id: 'email', required: true, autocomplete: 'email' }),
    ]),
    el('div', { class: 'form-row' }, [
      el('label', { for: 'password' }, 'Password'),
      el('input', { type: 'password', name: 'password', id: 'password', required: true, autocomplete: 'current-password' }),
    ]),
    el('button', { type: 'submit', class: 'btn btn--primary', style: { width: '100%', justifyContent: 'center' } }, 'Sign in'),
  ]);

  const page = el('div', { class: 'login' }, [
    el('div', { class: 'login__logo' }, [
      el('strong', { style: { color: 'var(--admin-primary)', fontSize: '1.1rem' } }, 'Scalderhurst'),
    ]),
    el('div', { class: 'panel' }, [form]),
    el('p', { style: { textAlign: 'center', color: 'var(--admin-text-muted)', fontSize: '0.85rem' } },
      'Content management · editors only'),
  ]);
  mount(page);
}

function renderList() {
  const header = el('div', { class: 'page-header' }, [
    el('h1', { class: 'page-header__title' }, 'Posts'),
    el('div', { class: 'page-header__actions' }, [
      el('button', {
        class: 'btn btn--primary',
        onclick: () => openEditor(null),
      }, '+ New post'),
    ]),
  ]);

  let body;
  if (state.listLoading) {
    body = el('div', { class: 'empty' }, 'Loading posts…');
  } else if (!state.posts.length) {
    body = el('div', { class: 'empty' }, [
      el('p', {}, 'No posts yet. Click ', el('em', {}, '+ New post'), ' to create the first one.'),
    ]);
  } else {
    const items = state.posts.map((p) => el('li', { class: 'post-list__item' }, [
      el('div', {}, [
        el('a', {
          class: 'post-list__title',
          href: '#',
          onclick: (e) => { e.preventDefault(); openEditor(p.filename); },
        }, p.title || '(untitled)'),
        el('div', { class: 'post-list__meta' }, [
          el('span', { class: `badge badge--${p.status}` }, p.status),
          el('span', {}, categoryLabel(p.category)),
          el('span', {}, '·'),
          el('span', {}, formatDate(p.date)),
        ]),
      ]),
      el('div', { class: 'post-list__actions' }, [
        el('button', {
          class: 'btn btn--small',
          onclick: () => openEditor(p.filename),
        }, 'Edit'),
        el('button', {
          class: 'btn btn--small btn--danger',
          onclick: () => handleDelete(p),
        }, 'Delete'),
      ]),
    ]));
    body = el('ul', { class: 'post-list' }, items);
  }

  mount(el('div', {}, [
    topbar(),
    el('div', { class: 'shell' }, [header, body]),
  ]));
}

// ---------- Editor --------------------------------------------

function renderEditor(existing) {
  // Form values
  const f = existing
    ? { ...existing.frontmatter, body: existing.body }
    : {
        title: '',
        slug: '',
        category: 'company-updates',
        date: new Date().toISOString().slice(0, 16),
        draft: true,
        excerpt: '',
        cover: '',
        cover_alt: '',
        tags: [],
      };

  // DOM — cover preview
  const coverPreview = el('img', {
    class: 'cover__preview',
    alt: 'Cover preview',
  });
  const coverPlaceholder = el('div', { class: 'cover__placeholder' }, 'No cover image yet — click Upload to add one.');
  const coverBlock = el('div', {}, [coverPlaceholder]);

  function setCoverPreview(src) {
    if (!src) {
      coverBlock.innerHTML = '';
      coverBlock.appendChild(coverPlaceholder);
      return;
    }
    coverPreview.src = src;
    coverBlock.innerHTML = '';
    coverBlock.appendChild(coverPreview);
  }
  if (f.cover) setCoverPreview(f.cover);

  // Hidden file input for cover upload
  const coverFileInput = el('input', {
    type: 'file',
    accept: 'image/jpeg,image/png,image/webp,image/avif',
    style: { display: 'none' },
    onchange: async () => {
      const file = coverFileInput.files && coverFileInput.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        toast('Cover image must be under 3 MB', 'error');
        coverFileInput.value = '';
        return;
      }
      // Immediate local preview while uploading
      const blobUrl = URL.createObjectURL(file);
      setCoverPreview(blobUrl);
      try {
        const { dataBase64, contentType, filename } = await readFileAsBase64(file);
        const resp = await api('/api/uploads', {
          method: 'POST',
          body: JSON.stringify({ dataBase64, contentType, filename }),
        });
        hiddenCover.value = resp.path;
        setCoverPreview(resp.path);
        toast('Cover uploaded', 'success');
      } catch (err) {
        toast('Upload failed: ' + err.message, 'error');
        setCoverPreview(f.cover || '');
      } finally {
        coverFileInput.value = '';
      }
    },
  });

  const hiddenCover = el('input', { type: 'hidden', name: 'cover', value: f.cover || '' });
  const coverAltInput = el('input', {
    type: 'text',
    name: 'cover_alt',
    id: 'cover_alt',
    value: f.cover_alt || '',
    placeholder: 'Describe the image — used for screen readers and SEO',
    required: true,
  });

  // Editor container
  const editorContainer = el('div', { class: 'ProseMirror' });
  const editorToolbar = el('div', { class: 'editor-toolbar' });

  // Form fields
  const titleInput = el('input', {
    type: 'text',
    name: 'title',
    id: 'title',
    value: f.title || '',
    required: true,
    placeholder: 'Post title',
  });
  const slugInput = el('input', {
    type: 'text',
    name: 'slug',
    id: 'slug',
    value: f.slug || '',
    placeholder: 'auto-generated from title',
  });
  let slugTouched = Boolean(existing); // don't auto-override existing posts
  slugInput.addEventListener('input', () => { slugTouched = true; });
  titleInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = slugify(titleInput.value);
  });

  const categorySelect = el('select', { name: 'category', id: 'category', required: true },
    CATEGORIES.map((c) => {
      const option = el('option', { value: c.value }, c.label);
      if (c.value === f.category) option.selected = true;
      return option;
    })
  );

  const dateInput = el('input', {
    type: 'datetime-local',
    name: 'date',
    id: 'date',
    required: true,
    value: toLocalDateTimeInput(f.date),
  });

  const draftCheckbox = el('input', {
    type: 'checkbox',
    name: 'draft',
    id: 'draft',
    checked: f.draft !== false,
  });

  const excerptInput = el('textarea', {
    name: 'excerpt',
    id: 'excerpt',
    placeholder: 'Optional — auto-generated from the first 155 characters if blank.',
    rows: 2,
  }, f.excerpt || '');

  const tagsInput = el('input', {
    type: 'text',
    name: 'tags',
    id: 'tags',
    value: (f.tags || []).join(', '),
    placeholder: 'Comma-separated, e.g. announcement, website',
  });

  // Save / delete / cancel buttons
  const saveBtn = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    onclick: () => handleSave(),
  }, existing ? 'Save changes' : 'Create post');

  const cancelBtn = el('button', {
    type: 'button',
    class: 'btn',
    onclick: () => { if (state.editor) { state.editor.destroy(); state.editor = null; } loadList(); },
  }, 'Cancel');

  const deleteBtn = existing ? el('button', {
    type: 'button',
    class: 'btn btn--danger',
    onclick: () => handleDelete({ filename: existing.filename, sha: existing.sha, title: f.title }),
  }, 'Delete post') : null;

  // Assemble
  const form = el('form', {
    onsubmit: (e) => { e.preventDefault(); handleSave(); },
  }, [
    el('div', { class: 'panel' }, [
      el('h2', {}, existing ? 'Edit post' : 'New post'),

      el('div', { class: 'form-row' }, [
        el('label', { for: 'title' }, 'Title'),
        titleInput,
      ]),

      el('div', { class: 'form-row--split', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' } }, [
        el('div', {}, [
          el('label', { for: 'slug' }, 'URL slug'),
          slugInput,
          el('div', { class: 'form-row__help' }, 'Auto-filled from title. Only edit if you want a shorter URL.'),
        ]),
        el('div', {}, [
          el('label', { for: 'category' }, 'Category'),
          categorySelect,
        ]),
      ]),

      el('div', { class: 'form-row--split', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.1rem' } }, [
        el('div', {}, [
          el('label', { for: 'date' }, 'Publish date'),
          dateInput,
          el('div', { class: 'form-row__help' }, 'Future dates are scheduled — not published until this time.'),
        ]),
        el('div', { style: { alignSelf: 'end' } }, [
          el('label', { class: 'checkbox' }, [
            draftCheckbox,
            el('span', {}, 'Save as draft (not visible on site)'),
          ]),
        ]),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h2', {}, 'Cover image'),
      el('div', { class: 'cover' }, [
        coverBlock,
        el('div', { class: 'cover__actions' }, [
          el('button', {
            type: 'button',
            class: 'btn',
            onclick: () => coverFileInput.click(),
          }, 'Upload cover…'),
          coverFileInput,
          hiddenCover,
          f.cover ? el('button', {
            type: 'button',
            class: 'btn btn--ghost',
            onclick: () => { hiddenCover.value = ''; setCoverPreview(''); },
          }, 'Remove') : null,
        ]),
        el('div', { class: 'form-row' }, [
          el('label', { for: 'cover_alt' }, 'Alt text (for screen readers)'),
          coverAltInput,
        ]),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h2', {}, 'Body'),
      el('div', { class: 'editor-wrap' }, [editorToolbar, editorContainer]),
    ]),

    el('div', { class: 'panel' }, [
      el('h2', {}, 'Summary & tags'),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'excerpt' }, 'Excerpt (optional)'),
        excerptInput,
        el('div', { class: 'form-row__help' }, 'Shown on the archive page and in meta descriptions. Leave blank to auto-generate from the first paragraph.'),
      ]),
      el('div', { class: 'form-row' }, [
        el('label', { for: 'tags' }, 'Tags'),
        tagsInput,
      ]),
    ]),

    el('div', { class: 'save-bar' }, [
      deleteBtn,
      el('div', { style: { flex: '1' } }),
      cancelBtn,
      saveBtn,
    ]),
  ]);

  mount(el('div', {}, [
    topbar(),
    el('div', { class: 'shell' }, [form]),
  ]));

  // Mount TipTap after the DOM is in place
  setTimeout(() => initEditor(editorContainer, editorToolbar, f.body || ''), 0);

  // ---- internal handlers wired to form elements ----

  async function handleSave() {
    if (!state.editor) return;
    const cover = hiddenCover.value.trim();
    if (!cover) { toast('Please upload a cover image first.', 'error'); return; }

    const payload = {
      title: titleInput.value.trim(),
      slug: slugInput.value.trim() || slugify(titleInput.value),
      category: categorySelect.value,
      date: new Date(dateInput.value).toISOString(),
      draft: draftCheckbox.checked,
      excerpt: excerptInput.value.trim(),
      cover,
      cover_alt: coverAltInput.value.trim(),
      tags: tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean),
      body: state.editor.getHTML(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      if (existing) {
        await api(`/api/posts/${encodeURIComponent(existing.filename)}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, sha: existing.sha }),
        });
        toast('Saved. The site will rebuild in ~30 seconds.', 'success', 5000);
      } else {
        await api('/api/posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Post created. The site will rebuild in ~30 seconds.', 'success', 5000);
      }
      state.editor.destroy();
      state.editor = null;
      await loadList();
    } catch (err) {
      toast(err.message, 'error', 6000);
      saveBtn.disabled = false;
      saveBtn.textContent = existing ? 'Save changes' : 'Create post';
    }
  }
}

function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initEditor(container, toolbar, initialHtml) {
  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      ImageExt.configure({ inline: false }),
      Placeholder.configure({ placeholder: 'Write your post…' }),
    ],
    content: initialHtml || '',
    onUpdate: () => {
      updateToolbarState(editor, toolbar);
    },
    onSelectionUpdate: () => {
      updateToolbarState(editor, toolbar);
    },
  });

  state.editor = editor;

  // Build toolbar
  const makeBtn = (label, cmd, isActive, opts = {}) => {
    const b = el('button', {
      type: 'button',
      title: opts.title || label,
      onclick: () => { cmd(); editor.commands.focus(); updateToolbarState(editor, toolbar); },
    }, label);
    b.dataset.active = String(isActive());
    return b;
  };

  const buttons = [
    { label: 'B', title: 'Bold',
      cmd: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive('bold') },
    { label: 'I', title: 'Italic',
      cmd: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive('italic') },
    { sep: true },
    { label: 'H2', title: 'Heading 2',
      cmd: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive('heading', { level: 2 }) },
    { label: 'H3', title: 'Heading 3',
      cmd: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive('heading', { level: 3 }) },
    { sep: true },
    { label: '•', title: 'Bullet list',
      cmd: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList') },
    { label: '1.', title: 'Numbered list',
      cmd: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList') },
    { label: '❝', title: 'Blockquote',
      cmd: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: () => editor.isActive('blockquote') },
    { sep: true },
    { label: 'Link', title: 'Add / edit link',
      cmd: () => promptLink(editor),
      isActive: () => editor.isActive('link') },
    { label: '🖼', title: 'Insert image',
      cmd: () => insertImage(editor),
      isActive: () => false },
    { sep: true },
    { label: '↺', title: 'Undo',
      cmd: () => editor.chain().focus().undo().run(),
      isActive: () => false },
    { label: '↻', title: 'Redo',
      cmd: () => editor.chain().focus().redo().run(),
      isActive: () => false },
  ];

  buttons.forEach((b) => {
    if (b.sep) {
      toolbar.appendChild(el('span', { class: 'editor-toolbar__sep' }));
    } else {
      toolbar.appendChild(makeBtn(b.label, b.cmd, b.isActive, { title: b.title }));
    }
  });

  updateToolbarState(editor, toolbar);
}

function updateToolbarState(editor, toolbar) {
  const btns = toolbar.querySelectorAll('button');
  btns.forEach((b) => {
    // Compute isActive by matching title to the editor state
    const title = b.getAttribute('title');
    let active = false;
    switch (title) {
      case 'Bold': active = editor.isActive('bold'); break;
      case 'Italic': active = editor.isActive('italic'); break;
      case 'Heading 2': active = editor.isActive('heading', { level: 2 }); break;
      case 'Heading 3': active = editor.isActive('heading', { level: 3 }); break;
      case 'Bullet list': active = editor.isActive('bulletList'); break;
      case 'Numbered list': active = editor.isActive('orderedList'); break;
      case 'Blockquote': active = editor.isActive('blockquote'); break;
      case 'Add / edit link': active = editor.isActive('link'); break;
      default: active = false;
    }
    b.classList.toggle('is-active', active);
  });
}

function promptLink(editor) {
  const previousUrl = editor.getAttributes('link').href;
  const url = window.prompt('Link URL (leave empty to remove)', previousUrl || 'https://');
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

function insertImage(editor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp,image/avif,image/gif';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast('Image must be under 3 MB', 'error');
      return;
    }
    try {
      toast('Uploading image…');
      const { dataBase64, contentType, filename } = await readFileAsBase64(file);
      const resp = await api('/api/uploads', {
        method: 'POST',
        body: JSON.stringify({ dataBase64, contentType, filename }),
      });
      editor.chain().focus().setImage({ src: resp.path, alt: filename.replace(/\.[^.]+$/, '') }).run();
      toast('Image inserted', 'success');
    } catch (err) {
      toast('Upload failed: ' + err.message, 'error');
    }
  };
  input.click();
}

// ---------- Actions -------------------------------------------

async function openEditor(filename) {
  if (!filename) {
    state.currentPost = null;
    state.view = 'edit';
    renderEditor(null);
    return;
  }
  try {
    renderLoading();
    const post = await api(`/api/posts/${encodeURIComponent(filename)}`);
    state.currentPost = post;
    state.view = 'edit';
    renderEditor(post);
  } catch (err) {
    toast('Could not open post: ' + err.message, 'error');
    renderList();
  }
}

async function handleDelete(post) {
  const ok = window.confirm(`Delete "${post.title || post.filename}"? This cannot be undone.`);
  if (!ok) return;
  try {
    let sha = post.sha;
    if (!sha) {
      // Fetch latest sha if we don't have it yet
      const data = await api(`/api/posts/${encodeURIComponent(post.filename)}`);
      sha = data.sha;
    }
    await api(`/api/posts/${encodeURIComponent(post.filename)}?sha=${encodeURIComponent(sha)}`, {
      method: 'DELETE',
    });
    toast('Post deleted.', 'success');
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    await loadList();
  } catch (err) {
    toast('Delete failed: ' + err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {}
  state.session = null;
  state.posts = [];
  if (state.editor) { state.editor.destroy(); state.editor = null; }
  renderLogin();
}

async function loadList() {
  state.view = 'list';
  state.listLoading = true;
  renderList();
  try {
    const data = await api('/api/posts');
    state.posts = data.posts || [];
    state.listLoading = false;
    renderList();
  } catch (err) {
    state.listLoading = false;
    state.posts = [];
    renderList();
    toast('Could not load posts: ' + err.message, 'error');
  }
}

async function bootstrap() {
  try {
    const me = await api('/api/me');
    state.session = me;
    await loadList();
  } catch (err) {
    state.session = null;
    renderLogin();
  }
}

bootstrap();
