const Player = {
  audio:       null,
  currentFile: null,
  currentName: null,
  isPlaying:   false,

  // DOM refs — set in init()
  el: {},

  init() {
    this.audio = document.getElementById('audioPlayer')
    this.el = {
      playBtn:    document.getElementById('playerPlayBtn'),
      filename:   document.getElementById('playerFilename'),
      statusIcon: document.getElementById('playerStatusIcon'),
      volBtn:     document.getElementById('playerVolBtn'),
      volSlider:  document.getElementById('volSlider'),
    }

    // Inject icons
    this.el.playBtn.innerHTML = ICONS.play
    this.el.volBtn.innerHTML  = ICONS.volHigh

    // Initial volume
    this.audio.volume = 0.8
    this._syncSliderFill(80)

    // Control events
    this.el.playBtn.addEventListener('click',  () => this.toggle())
    this.el.volBtn.addEventListener('click',   () => this.toggleMute())
    this.el.volSlider.addEventListener('input', e => {
      const val = parseInt(e.target.value, 10)
      this.audio.volume  = val / 100
      this.audio.muted   = false
      this._syncSliderFill(val)
      this._syncVolIcon(val, false)
    })

    // Audio events
    this.audio.addEventListener('ended', () => this._onEnded())
    this.audio.addEventListener('error', () => this._onError())

    // Global spacebar → toggle (only when no input is focused)
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !this._inputFocused()) {
        e.preventDefault()
        this.toggle()
      }
    })
  },

  /* ── Public API ─────────────────────────────────────────────── */

  /**
   * Load a file and start playing immediately.
   * @param {string} filePath  Absolute OS path
   * @param {string} label     Display name (filename without path)
   */
  load(filePath, label) {
    this.stop()
    this.currentFile = filePath
    this.currentName = label || this._basename(filePath)

    // Build a file:// URL that works on both platforms
    const fileUrl = filePath.startsWith('/')
      ? `file://${filePath}`
      : `file:///${filePath.replace(/\\/g, '/')}`

    this.audio.src = fileUrl
    this.el.filename.textContent = this.currentName
    this.el.playBtn.disabled = false
    this.play()
  },

  play() {
    if (!this.currentFile) return
    this.audio.play().catch(() => {})
    this.isPlaying = true
    this.el.playBtn.innerHTML = ICONS.stop
    this.el.statusIcon.textContent = '▶'
    this.el.statusIcon.classList.add('playing')
  },

  stop() {
    this.audio.pause()
    this.audio.currentTime = 0
    this.isPlaying = false
    this.el.playBtn.innerHTML = ICONS.play
    this.el.statusIcon.textContent = '■'
    this.el.statusIcon.classList.remove('playing')
  },

  toggle() {
    if (!this.currentFile) return
    this.isPlaying ? this.stop() : this.play()
  },

  toggleMute() {
    this.audio.muted = !this.audio.muted
    const vol = parseInt(this.el.volSlider.value, 10)
    this._syncVolIcon(vol, this.audio.muted)
  },

  /* ── Private ────────────────────────────────────────────────── */

  _onEnded() {
    this.isPlaying = false
    this.el.playBtn.innerHTML = ICONS.play
    this.el.statusIcon.textContent = '■'
    this.el.statusIcon.classList.remove('playing')
  },

  _onError() {
    this.stop()
    this.el.filename.textContent = 'Playback error'
  },

  /** Update the CSS gradient fill on the volume slider */
  _syncSliderFill(val) {
    this.el.volSlider.style.backgroundSize = `${val}% 100%, 100% 100%`
  },

  _syncVolIcon(vol, muted) {
    if (muted || vol === 0) {
      this.el.volBtn.innerHTML = ICONS.volMute
    } else if (vol < 50) {
      this.el.volBtn.innerHTML = ICONS.volLow
    } else {
      this.el.volBtn.innerHTML = ICONS.volHigh
    }
  },

  _inputFocused() {
    const tag = document.activeElement?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  },

  _basename(p) {
    return p.replace(/\\/g, '/').split('/').pop()
  },
}
