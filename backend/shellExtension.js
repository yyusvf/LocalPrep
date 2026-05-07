/**
 * Windows Shell Extension — per-user right-click menu for audio files.
 * Uses HKCU\Software\Classes\SystemFileAssociations (no admin required).
 */

const { execSync } = require('child_process')
const { spawn }    = require('child_process')
const path         = require('path')
const fs           = require('fs')
const os           = require('os')

const EXTS = ['.mp3', '.flac', '.wav', '.ogg', '.m4a']
const HKCU      = 'HKCU:\\Software\\Classes\\SystemFileAssociations'
const HKCU_DIR  = 'HKCU:\\Software\\Classes\\Directory'

const ACTIONS = [
  { id: 'sr',   label: 'Convert Sample Rate', tab: 'sr'   },
  { id: 'fmt',  label: 'Convert Format',       tab: 'fmt'  },
  { id: 'meta', label: 'Edit Metadata',        tab: 'meta' },
]

// ── Public API ────────────────────────────────────────────────────

function getExePath() {
  const { app } = require('electron')
  return app.isPackaged ? process.execPath : process.execPath
}

function isRegistered() {
  try {
    const key = `${HKCU}\\.mp3\\shell\\LocalPrep`
    const out  = execSync(
      `powershell -NoProfile -Command "Test-Path '${key}'"`,
      { encoding: 'utf8', timeout: 5000 }
    )
    return out.trim() === 'True'
  } catch {
    return false
  }
}

async function register() {
  const exe = getExePath().replace(/\\/g, '\\\\')
  let script = ''

  // ── Per-extension file entries ────────────────────────────────
  for (const ext of EXTS) {
    const base = `${HKCU}\\${ext}\\shell\\LocalPrep`
    script += `
New-Item -Path "${base}" -Force | Out-Null
Set-ItemProperty -Path "${base}" -Name "MUIVerb" -Value "LocalPrep" -Force
Set-ItemProperty -Path "${base}" -Name "SubCommands" -Value "" -Force
New-Item -Path "${base}\\shell" -Force | Out-Null
`
    for (const a of ACTIONS) {
      const cmd = `\\"${exe}\\" --tab ${a.tab} --file \\"%1\\"`
      script += `
New-Item -Path "${base}\\shell\\${a.id}" -Force | Out-Null
Set-ItemProperty -Path "${base}\\shell\\${a.id}" -Name "(Default)" -Value "${a.label}" -Force
New-Item -Path "${base}\\shell\\${a.id}\\command" -Force | Out-Null
Set-ItemProperty -Path "${base}\\shell\\${a.id}\\command" -Name "(Default)" -Value "${cmd}" -Force
`
    }
  }

  // ── Folder (Directory) entry ──────────────────────────────────
  const dirBase = `${HKCU_DIR}\\shell\\LocalPrep`
  script += `
New-Item -Path "${dirBase}" -Force | Out-Null
Set-ItemProperty -Path "${dirBase}" -Name "MUIVerb" -Value "LocalPrep" -Force
Set-ItemProperty -Path "${dirBase}" -Name "SubCommands" -Value "" -Force
New-Item -Path "${dirBase}\\shell" -Force | Out-Null
`
  for (const a of ACTIONS) {
    const cmd = `\\"${exe}\\" --tab ${a.tab} --folder \\"%1\\"`
    script += `
New-Item -Path "${dirBase}\\shell\\${a.id}" -Force | Out-Null
Set-ItemProperty -Path "${dirBase}\\shell\\${a.id}" -Name "(Default)" -Value "${a.label}" -Force
New-Item -Path "${dirBase}\\shell\\${a.id}\\command" -Force | Out-Null
Set-ItemProperty -Path "${dirBase}\\shell\\${a.id}\\command" -Name "(Default)" -Value "${cmd}" -Force
`
  }

  return _runPs(script)
}

async function unregister() {
  let script = ''
  for (const ext of EXTS) {
    const base = `${HKCU}\\${ext}\\shell\\LocalPrep`
    script += `if (Test-Path "${base}") { Remove-Item -Path "${base}" -Recurse -Force }\n`
  }
  const dirBase = `${HKCU_DIR}\\shell\\LocalPrep`
  script += `if (Test-Path "${dirBase}") { Remove-Item -Path "${dirBase}" -Recurse -Force }\n`
  return _runPs(script)
}

// ── Private ────────────────────────────────────────────────────────

function _runPs(script) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `lp_shellext_${Date.now()}.ps1`)
    fs.writeFileSync(tmp, script, 'utf8')
    const proc = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp
    ])
    const errs = []
    proc.stderr.on('data', d => errs.push(d.toString()))
    proc.on('close', code => {
      fs.unlink(tmp, () => {})
      if (code === 0) resolve()
      else reject(new Error(errs.join('').trim() || `PowerShell exited ${code}`))
    })
    proc.on('error', err => { fs.unlink(tmp, () => {}); reject(err) })
  })
}

module.exports = { register, unregister, isRegistered }
