/* All SVG icons as inline strings — injected via innerHTML by app.js */
window.ICONS = {

  // ── Sidebar nav ──────────────────────────────────────────────────
  sampleRate: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 9 Q2.5 9 3 5 Q3.5 1 5 9 Q6.5 17 8 9 Q9.5 1 11 9 Q12.5 17 14 9 Q14.5 5 15 9 Q15.5 9 17 9"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  format: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 5.5h9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M14.5 3.5l2 2-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 12.5H5.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M3.5 10.5l-2 2 2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  metadata: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 4.5h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M3 8h7"   stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M3 11.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M12.5 10l1.5-1.5 1.5 1.5-2.5 4H11l.5-2.5z"
      stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  history: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.4"/>
    <path d="M9 5.5V9.2l2.8 2.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  settings: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- 6-tooth gear: outer r=7.5, inner r=5.5, tooth half-angle=10°, gap half-angle=20° -->
    <path d="M7.1 3.8 L7.7 1.6 L10.3 1.6 L10.9 3.8
             L12.5 4.8 L14.7 4.2 L16 6.4 L14.4 8
             L14.4 10 L16 11.6 L14.7 13.8 L12.5 13.2
             L10.9 14.2 L10.3 16.4 L7.7 16.4 L7.1 14.2
             L5.5 13.2 L3.3 13.8 L2 11.6 L3.6 10
             L3.6 8 L2 6.4 L3.3 4.2 L5.5 4.8 Z"
      stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="9" cy="9" r="2.5" stroke="currentColor" stroke-width="1.3"/>
  </svg>`,

  // ── Logo ─────────────────────────────────────────────────────────
  logo: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="7" fill="#c8f542"/>
    <path d="M4 14 Q6 8 8 14 Q10 20 12 14 Q14 8 16 14 Q18 20 20 14 Q22 8 24 14"
      stroke="#0a0a0a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // ── Player ───────────────────────────────────────────────────────
  play: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 1.8l9 5.2-9 5.2V1.8z"/>
  </svg>`,

  stop: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <rect x="2.5" y="2.5" width="9" height="9" rx="1.5"/>
  </svg>`,

  volHigh: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 5.5h3l3.5-3v11l-3.5-3H2V5.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M10.5 4.5c1.3 1 2 2.5 2 3.5s-.7 2.5-2 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M12.5 2c2 1.5 3 4 3 6s-1 4.5-3 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`,

  volLow: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 5.5h3l3.5-3v11l-3.5-3H2V5.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M10.5 4.5c1.3 1 2 2.5 2 3.5s-.7 2.5-2 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`,

  volMute: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 5.5h3l3.5-3v11l-3.5-3H2V5.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M11 6l3 3m0-3l-3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`,

  // ── Titlebar (Windows) ───────────────────────────────────────────
  winMinimize: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,

  winMaximize: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/>
  </svg>`,

  winRestore: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3.5" y="1.5" width="5" height="5" rx="0.8" stroke="currentColor" stroke-width="1.2"/>
    <path d="M1.5 4.5v4h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  winClose: `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`,
}
