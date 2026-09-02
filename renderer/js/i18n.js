/* Minimal i18n — JSON-file based, live switchable */
const i18n = {
  _lang:  'en',
  _store: {},

  async load(lang) {
    try {
      const res  = await fetch(`./i18n/${lang}.json`)
      this._store = await res.json()
      this._lang  = lang
      this._apply()
    } catch (err) {
      console.warn('[i18n] Failed to load', lang, err)
    }
  },

  async setLanguage(lang) {
    await this.load(lang)
    // Labels baked into JS-built widgets (table headers, etc.) are not
    // covered by _apply(); they listen for this instead.
    document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }))
  },

  /**
   * Look up a key. Any {name} in the string is replaced from `params`, so
   * counts and versions can sit inside the translated sentence rather than
   * being glued on in whatever order English happens to use.
   */
  t(key, fallback = key, params = null) {
    let out = this._store[key] ?? fallback
    if (params) {
      for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(v)
    }
    return out
  },

  _apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n
      const val = this.t(key)
      if (val !== key) el.textContent = val
    })
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder
      const val = this.t(key)
      if (val !== key) el.placeholder = val
    })
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle
      const val = this.t(key)
      if (val !== key) el.title = val
    })
  },
}

window.i18n = i18n
