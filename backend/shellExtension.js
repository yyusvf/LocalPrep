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

/**
 * The quoted launcher for a registry command value.
 *
 * Packaged, process.execPath is LocalPrep.exe and launches on its own. In a dev
 * run it is electron.exe, which needs the app directory as its first argument —
 * without it the menu entry appears but starts nothing.
 */
function getExePath() {
  const { app } = require('electron')
  if (app.isPackaged) return `"${process.execPath}"`
  return `"${process.execPath}" "${app.getAppPath()}"`
}

/**
 * Icon shown next to the "LocalPrep" entry in the context menu.
 * Explorer takes "<file>,<index>"; index 0 is the exe's own embedded icon,
 * which electron-builder sets from build/icon.ico. In a dev run process.execPath
 * is electron.exe, so the bundled .ico is used directly instead.
 */
function getIconRef() {
  const { app } = require('electron')
  // Packaged: the exe carries the icon electron-builder embedded from build/icon.ico
  if (app.isPackaged) return process.execPath + ',0'
  // Dev: point at the .ico directly. Resolved from this file, not from
  // app.getAppPath(), so it holds however the app was launched.
  const dev = path.join(__dirname, '..', 'build', 'icon.ico')
  return fs.existsSync(dev) ? dev : process.execPath + ',0'
}

function isRegistered() {
  try {
    const key = `${HKCU}\\.mp3\\shell\\LocalPrep`
    const out = execSync(
      `powershell -NoProfile -Command "Test-Path '${key}'"`,
      { encoding: 'utf8', timeout: 5000 }
    )
    return out.trim() === 'True'
  } catch {
    return false
  }
}

/**
 * Quote a value for a PowerShell single-quoted string.
 *
 * Everything here goes into a generated .ps1. Double-quoted PS strings were
 * used before, which silently broke the command entries: a backslash is not an
 * escape character in PowerShell, so the \" around the exe path terminated the
 * string early and every command value ended up empty — the menu appeared but
 * did nothing. In single-quoted strings the only escape is '' for a quote, so
 * Windows paths and the embedded " around %1 pass through untouched.
 */
function psq(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Registry default value — Set-ItemProperty cannot write it, Set-Item can. */
function setDefault(key, value) {
  return `Set-Item -Path ${psq(key)} -Value ${psq(value)} -Force\n`
}

function setProp(key, name, value) {
  return `Set-ItemProperty -Path ${psq(key)} -Name ${psq(name)} -Value ${psq(value)} -Force\n`
}

function newKey(key) {
  return `New-Item -Path ${psq(key)} -Force | Out-Null\n`
}

/** The cascading parent plus its three actions, for one registry base path. */
function menuScript(base, icon, exe, argName) {
  let s = newKey(base)
  s += setProp(base, 'MUIVerb', 'LocalPrep')
  s += setProp(base, 'SubCommands', '')
  s += setProp(base, 'Icon', icon)          // logo next to the name
  s += newKey(`${base}\\shell`)
  for (const a of ACTIONS) {
    const key = `${base}\\shell\\${a.id}`
    s += newKey(key)
    s += setDefault(key, a.label)
    s += newKey(`${key}\\command`)
    s += setDefault(`${key}\\command`, `${exe} --tab ${a.tab} --${argName} "%1"`)
  }
  return s
}

async function register() {
  const exe  = getExePath()
  const icon = getIconRef()
  let script = '$ErrorActionPreference = "Stop"\n'

  for (const ext of EXTS) {
    script += menuScript(`${HKCU}\\${ext}\\shell\\LocalPrep`, icon, exe, 'file')
  }
  script += menuScript(`${HKCU_DIR}\\shell\\LocalPrep`, icon, exe, 'folder')

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
