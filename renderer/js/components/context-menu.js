/* Singleton custom context menu */
class ContextMenu {
  constructor() {
    this._el = document.createElement('div')
    this._el.className = 'context-menu'
    this._el.style.display = 'none'
    document.body.appendChild(this._el)

    // Dismiss on any click / Escape
    document.addEventListener('mousedown', e => {
      if (!this._el.contains(e.target)) this.hide()
    })
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.hide()
    })
    // Dismiss on scroll (in case table scrolls under menu)
    document.addEventListener('scroll', () => this.hide(), true)
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {Array<{label:string, icon?:string, action:()=>void} | 'sep'>} items
   */
  show(x, y, items) {
    this._el.innerHTML = items.map((item, i) => {
      if (item === 'sep') return `<div class="cm-divider"></div>`
      return `<button class="cm-item" data-idx="${i}">
        ${item.icon ? `<span class="cm-icon">${item.icon}</span>` : ''}
        <span>${item.label}</span>
      </button>`
    }).join('')

    // Bind actions
    this._el.querySelectorAll('.cm-item').forEach(btn => {
      const idx  = parseInt(btn.dataset.idx, 10)
      const item = items[idx]
      if (item && item.action) {
        btn.addEventListener('mousedown', e => {
          e.stopPropagation()
          this.hide()
          // Small delay so hide animation doesn't race with action
          setTimeout(() => item.action(), 0)
        })
      }
    })

    // Show off-screen first to measure
    this._el.style.display = 'block'
    this._el.style.left = '-9999px'
    this._el.style.top  = '-9999px'

    const w  = this._el.offsetWidth
    const h  = this._el.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    this._el.style.left = `${x + w > vw ? x - w : x}px`
    this._el.style.top  = `${y + h > vh ? y - h : y}px`
  }

  hide() {
    this._el.style.display = 'none'
  }
}

window.ContextMenu = new ContextMenu()
