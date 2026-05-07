/* ── App entry point ─────────────────────────────────────────────── */

// ── Shared utilities (available globally) ────────────────────────

/** Format bytes to human-readable string */
function _fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Format seconds to mm:ss or hh:mm:ss */
function _fmtTime(sec) {
  if (!sec || sec < 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/** True when an input/textarea/select is focused */
function _inputFocused() {
  const tag = document.activeElement?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/** Simple toast notification */
function _toast(message, type = 'info') {
  const el = document.createElement('div')
  el.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:${type === 'error' ? 'var(--error)' : 'var(--bg-card)'};
    color:${type === 'error' ? '#fff' : 'var(--text-primary)'};
    border:1px solid var(--border-strong);
    padding:9px 18px;border-radius:var(--radius-md);font-size:13px;
    box-shadow:var(--shadow-md);z-index:9998;
    animation:toastIn .2s ease both;
  `
  el.textContent = message
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.animation = 'toastOut .2s ease both'
    el.addEventListener('animationend', () => el.remove())
  }, 2800)
}

/** Build the properties modal HTML from a file properties object */
function _propsHtml(p) {
  const row = (key, val) => `<span class="props-key">${key}</span><span class="props-val">${val ?? '—'}</span>`
  const sRate = p.sampleRate ? `${(p.sampleRate/1000).toFixed(p.sampleRate%1000===0?0:1)} kHz` : '—'
  const dur   = p.duration   ? _fmtTime(p.duration) : '—'
  const rate  = p.bitrate    ? `${Math.round(p.bitrate/1000)} kbps` : '—'

  return `
    ${p.hasCover ? `<div class="props-cover-wrap"><img class="props-cover" id="propsThumb" alt=""></div>` : ''}
    <div class="props-grid">
      <span class="props-section-title">File</span>
      ${row('Filename', p.filename)}
      ${row('Size',     _fmtSize(p.size))}
      ${row('Modified', p.modified ? new Date(p.modified).toLocaleString() : '—')}
      <span class="props-section-title">Technical</span>
      ${row('Format',      p.format)}
      ${row('Codec',       p.codec)}
      ${row('Sample Rate', sRate)}
      ${row('Bitrate',     rate)}
      ${row('Duration',    dur)}
      ${row('Channels',    p.channels)}
      ${p.tags ? `
      <span class="props-section-title">Tags</span>
      ${Object.entries(p.tags).filter(([,v]) => v).map(([k,v]) => row(k.charAt(0).toUpperCase()+k.slice(1), v)).join('')}
      ` : ''}
    </div>
  `
}

/**
 * Attach folder drag-and-drop to an element.
 * Calls onFolders([path, ...]) with every dropped directory path.
 * Also shows a visual highlight (class "dz-active") while hovering.
 */
function _enableFolderDrop(el, onFolders) {
  el.addEventListener('dragover', e => {
    if (![...e.dataTransfer.items].some(i => i.kind === 'file')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    el.classList.add('dz-active')
  })
  el.addEventListener('dragleave', e => {
    if (!el.contains(e.relatedTarget)) el.classList.remove('dz-active')
  })
  el.addEventListener('drop', e => {
    e.preventDefault()
    el.classList.remove('dz-active')
    const dirs = []
    for (const item of e.dataTransfer.items) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry()
      const file  = item.getAsFile()
      if (file?.path && entry?.isDirectory) dirs.push(file.path)
    }
    if (dirs.length) onFolders(dirs)
    else _toast('Drop a folder to add files')
  })
}

// Toast CSS (injected once)
const _toastStyle = document.createElement('style')
_toastStyle.textContent = `
  @keyframes toastIn  { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
  @keyframes toastOut { from { opacity:1; transform:translateX(-50%) translateY(0); } to { opacity:0; transform:translateX(-50%) translateY(8px); } }
`
document.head.appendChild(_toastStyle)

// ── Icons: add folder icon used by context menus ─────────────────
// (added here so it doesn't clutter icons.js)
Object.assign(ICONS, {
  folder: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 3a1 1 0 011-1h3l1.5 1.5H12a1 1 0 011 1V11a1 1 0 01-1 1H2a1 1 0 01-1-1V3z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`,
})

// ── Auto-update banner ────────────────────────────────────────────
function _initUpdateListener() {
  const banner       = document.getElementById('updateBanner')
  const bannerMsg    = document.getElementById('updateBannerMsg')
  const progressWrap = document.getElementById('updateProgressWrap')
  const progressFill = document.getElementById('updateProgressFill')
  const installBtn   = document.getElementById('updateInstallBtn')
  const dismissBtn   = document.getElementById('updateBannerDismiss')
  const navBadge     = document.getElementById('updateNavBadge')

  if (!banner || !window.api?.updater) return

  function _showBanner(msg, { install = false, progress = false } = {}) {
    bannerMsg.textContent            = msg
    progressWrap.style.display       = progress ? '' : 'none'
    installBtn.style.display         = install  ? '' : 'none'
    banner.style.display             = ''
    if (navBadge) navBadge.style.display = ''
  }

  window.api.updater.onAvailable(info => {
    _showBanner(`v${info.version} is available — downloading in background…`, { progress: true })
    document.dispatchEvent(new CustomEvent('updater:status', { detail: { type: 'available', info } }))
  })

  window.api.updater.onProgress(prog => {
    progressWrap.style.display  = ''
    progressFill.style.width    = `${Math.round(prog.percent)}%`
    bannerMsg.textContent       = `Downloading v${prog.version ?? ''}… ${Math.round(prog.percent)}%`
  })

  window.api.updater.onDownloaded(info => {
    _showBanner(`v${info.version} downloaded — ready to install`, { install: true })
    document.dispatchEvent(new CustomEvent('updater:status', { detail: { type: 'downloaded', info } }))
  })

  window.api.updater.onNotAvailable(() => {
    // Silent — only settings tab cares
    document.dispatchEvent(new CustomEvent('updater:status', { detail: { type: 'not-available' } }))
  })

  window.api.updater.onError(msg => {
    document.dispatchEvent(new CustomEvent('updater:status', { detail: { type: 'error', msg } }))
  })

  installBtn.addEventListener('click',  () => window.api.updater.install())
  dismissBtn.addEventListener('click',  () => { banner.style.display = 'none' })
}

// ── Main init ─────────────────────────────────────────────────────
async function init() {
  const platform = window.api.platform

  // Platform class on body
  document.body.classList.add(
    platform === 'win32'  ? 'is-windows' :
    platform === 'darwin' ? 'is-darwin'  : 'is-linux'
  )

  // Logo
  document.getElementById('logoIcon').innerHTML = ICONS.logo

  // Nav icons
  document.getElementById('icon-sample-rate').innerHTML = ICONS.sampleRate
  document.getElementById('icon-format').innerHTML      = ICONS.format
  document.getElementById('icon-metadata').innerHTML    = ICONS.metadata
  document.getElementById('icon-history').innerHTML     = ICONS.history
  document.getElementById('icon-settings').innerHTML    = ICONS.settings

  // Titlebar
  const titlebar = document.getElementById('titlebar')
  if (platform === 'win32') {
    titlebar.classList.add('is-windows')
    const btnMin   = document.getElementById('btnMinimize')
    const btnMax   = document.getElementById('btnMaximize')
    const btnClose = document.getElementById('btnClose')
    btnMin.innerHTML   = ICONS.winMinimize
    btnMax.innerHTML   = ICONS.winMaximize
    btnClose.innerHTML = ICONS.winClose
    btnMin.addEventListener('click',   () => window.api.window.minimize())
    btnMax.addEventListener('click',   () => window.api.window.maximize())
    btnClose.addEventListener('click', () => window.api.window.close())
    window.api.window.onMaximized(isMax => { btnMax.innerHTML = isMax ? ICONS.winRestore : ICONS.winMaximize })
    window.api.window.isMaximized().then(isMax => { if (isMax) btnMax.innerHTML = ICONS.winRestore })
  } else if (platform === 'darwin') {
    titlebar.classList.add('is-darwin')
  }

  // Core modules
  Nav.init()
  Player.init()

  // Register global convert event listeners — fan out via DOM
  window.api.convert.onProgress(data => {
    document.dispatchEvent(new CustomEvent('convert:progress', { detail: data }))
  })
  window.api.convert.onLog(msg => {
    document.dispatchEvent(new CustomEvent('convert:log', { detail: msg }))
  })

  // Auto-update banner
  _initUpdateListener()

  // CLI / shell-extension open handler
  window.api.onCliOpen(({ tab, file, folder }) => {
    const tabMap = { sr: 'sample-rate', fmt: 'format', meta: 'metadata' }
    const tabId  = tabMap[tab] || tab
    if (tabId) Nav.navigate(tabId)
    const tabObj = tabId === 'sample-rate' ? window.SampleRateTab
                 : tabId === 'format'      ? window.FormatTab
                 : tabId === 'metadata'    ? window.MetadataTab
                 : null
    if (file   && tabObj?._openFile)   tabObj._openFile(file)
    if (folder && tabObj?._openFolder) tabObj._openFolder(folder)
  })

  // Init tab modules
  // NOTE: Must use window.XTab (not XTab) because class declarations create
  // a lexical binding that shadows the window property set by new XTab()
  window.SampleRateTab.init()
  window.FormatTab.init()
  window.MetadataTab.init()
  window.HistoryTab.init()
  window.SettingsTab.init()

  // Refresh history when switching to that tab
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.dataset.tab === 'history') window.HistoryTab.refresh()
    })
  })

  // ffmpeg check
  const dot   = document.getElementById('ffmpegDot')
  const label = document.getElementById('ffmpegLabel')
  try {
    const result = await window.api.ffmpeg.check()
    dot.classList.add(result.available ? 'ok' : 'error')
    label.textContent = result.available ? 'ffmpeg ready' : 'ffmpeg missing'
    // Show ffmpeg path in settings
    const pathEl = document.getElementById('setFfmpegPath')
    if (pathEl) pathEl.value = result.path
  } catch {
    dot.classList.add('error')
    label.textContent = 'ffmpeg error'
  }

  // Load saved language
  const savedLang = await window.api.store.get('language') || 'en'
  i18n.load(savedLang)
}

document.addEventListener('DOMContentLoaded', init)
