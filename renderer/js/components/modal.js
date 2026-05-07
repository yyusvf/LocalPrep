/* Simple modal / overlay system */
class Modal {
  /**
   * Open a modal. Returns { overlay, close, setContent }.
   * @param {{ title:string, body:string|HTMLElement, width?:number, footer?:string }} opts
   */
  static open(opts = {}) {
    const { title = '', body = '', width = 540, footer = '' } = opts

    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'
    overlay.innerHTML = `
      <div class="modal" style="width:${width}px;max-width:calc(100vw - 40px)">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="modal-close" aria-label="Close">${ICONS.winClose}</button>
        </div>
        <div class="modal-body"></div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `

    const modalBody = overlay.querySelector('.modal-body')

    if (typeof body === 'string') {
      modalBody.innerHTML = body
    } else {
      modalBody.appendChild(body)
    }

    const close = () => {
      overlay.classList.add('closing')
      overlay.addEventListener('animationend', () => overlay.remove(), { once: true })
    }

    overlay.querySelector('.modal-close').addEventListener('click', close)
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close() })

    const keyHandler = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', keyHandler) } }
    document.addEventListener('keydown', keyHandler)

    document.body.appendChild(overlay)

    return {
      overlay,
      close,
      modalBody,
      setContent: (html) => { modalBody.innerHTML = html },
    }
  }

  /**
   * Show a simple confirm dialog.
   * @returns {Promise<boolean>}
   */
  static confirm(message, { title = 'Confirm', confirmLabel = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
      const { close, overlay } = Modal.open({
        title,
        body: `<p style="color:var(--text-secondary);line-height:1.6">${message}</p>`,
        footer: `
          <button class="btn btn-ghost btn-sm" id="mcCancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" id="mcConfirm">${confirmLabel}</button>
        `,
      })

      overlay.querySelector('#mcCancel').addEventListener('click',  () => { close(); resolve(false) })
      overlay.querySelector('#mcConfirm').addEventListener('click', () => { close(); resolve(true)  })
    })
  }
}

window.Modal = Modal
