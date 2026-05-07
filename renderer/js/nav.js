const Nav = {
  current: 'sample-rate',

  // Maps data-tab → ICONS key
  iconMap: {
    'sample-rate': 'sampleRate',
    'format':      'format',
    'metadata':    'metadata',
    'history':     'history',
    'settings':    'settings',
  },

  // Maps data-tab → placeholder icon
  placeholderMap: {
    'sample-rate': 'ph-icon-sr',
    'format':      'ph-icon-fmt',
    'metadata':    'ph-icon-meta',
    'history':     'ph-icon-hist',
    'settings':    'ph-icon-set',
  },

  init() {
    // Inject SVG icons into sidebar nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      const tab     = item.dataset.tab
      const iconEl  = item.querySelector('.nav-icon')
      const iconKey = this.iconMap[tab]
      if (iconEl && iconKey && ICONS[iconKey]) {
        iconEl.innerHTML = ICONS[iconKey]
      }
    })

    // Inject dimmed icons into placeholder states
    Object.entries(this.placeholderMap).forEach(([tab, elId]) => {
      const el      = document.getElementById(elId)
      const iconKey = this.iconMap[tab]
      if (el && iconKey && ICONS[iconKey]) {
        el.innerHTML = ICONS[iconKey]
      }
    })

    // Click handlers
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault()
        this.navigate(item.dataset.tab)
      })
    })
  },

  navigate(tab) {
    if (tab === this.current) return

    // Active state on nav items
    document.querySelectorAll('.nav-item').forEach(item =>
      item.classList.toggle('active', item.dataset.tab === tab)
    )

    // Show / hide panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      const isTarget = panel.dataset.panel === tab
      panel.classList.toggle('active', isTarget)
      // Re-trigger animation
      if (isTarget) {
        panel.style.animation = 'none'
        panel.offsetHeight     // force reflow
        panel.style.animation  = ''
      }
    })

    this.current = tab
  },
}
