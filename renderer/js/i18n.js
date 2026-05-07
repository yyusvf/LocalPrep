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

  setLanguage(lang) { this.load(lang) },

  t(key, fallback = key) {
    return this._store[key] ?? fallback
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
