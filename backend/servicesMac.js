/**
 * macOS Services entry — "LocalPrep" under the right-click Services menu.
 *
 * Why a Quick Action and not NSServices in our own Info.plist:
 * a service declared by an app only works if the app registers a native
 * services provider object with NSApplication. Electron exposes no such hook,
 * so the entry would appear and do nothing. An Automator Quick Action installed
 * into ~/Library/Services is the supported no-native-code route, needs no admin
 * rights, and is what the Services menu reads anyway.
 *
 * The workflow runs a shell script that launches the app binary directly rather
 * than `open -a`. `open` on an already-running app just activates it and drops
 * the arguments; launching the binary starts a second process, which our
 * single-instance lock turns into a 'second-instance' event carrying argv.
 */

const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { execFile } = require('child_process')

const SERVICE_NAME = 'LocalPrep.workflow'
const AUDIO_EXTS   = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'aiff', 'aif']

function servicesDir() {
  return path.join(os.homedir(), 'Library', 'Services')
}

function workflowPath() {
  return path.join(servicesDir(), SERVICE_NAME)
}

function isRegistered() {
  try {
    return fs.existsSync(path.join(workflowPath(), 'Contents', 'document.wflow'))
  } catch {
    return false
  }
}

// ── Plist helpers ─────────────────────────────────────────────────
// Hand-rolled so no plist dependency is needed. Only the shapes used below.

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Shell script the Quick Action runs.
 *
 * NSSendFileTypes can say "a folder", but not "a folder that contains audio",
 * so the entry shows for every folder and the filtering happens here at click
 * time: a folder with no audio in it is skipped rather than opening an empty
 * window.
 */
function shellScript({ exe, appPath }) {
  const findExpr = AUDIO_EXTS.map(e => `-iname '*.${e}'`).join(' -o ')
  // In a dev run the binary is electron and needs the app directory as its
  // first argument; packaged it launches on its own and APP is not used.
  const launch = appPath ? `"$EXE" "$APP"` : `"$EXE"`
  return [
    `#!/bin/bash`,
    `EXE=${JSON.stringify(exe)}`,
    ...(appPath ? [`APP=${JSON.stringify(appPath)}`] : []),
    `for f in "$@"; do`,
    `  if [ -d "$f" ]; then`,
    `    # Only folders that actually hold audio are worth opening`,
    `    if [ -z "$(find "$f" -maxdepth 3 -type f \\( ${findExpr} \\) -print -quit)" ]; then`,
    `      continue`,
    `    fi`,
    `    ${launch} --folder "$f" &`,
    `  else`,
    `    ${launch} --file "$f" &`,
    `  fi`,
    `done`,
    ``,
  ].join('\n')
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>LocalPrep</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.audio</string>
        <string>public.folder</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`
}

/**
 * Minimal Automator document containing a single "Run Shell Script" action.
 * The action takes the selected paths as arguments ("as arguments" = 1).
 */
function documentWflow(launcher) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key>
  <string>523</string>
  <key>AMApplicationVersion</key>
  <string>2.10</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Optional</key>
          <true/>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>AMActionVersion</key>
        <string>2.0.3</string>
        <key>AMApplication</key>
        <array>
          <string>Automator</string>
        </array>
        <key>AMParameterProperties</key>
        <dict>
          <key>COMMAND_STRING</key>
          <dict/>
          <key>CheckedForUserDefaultShell</key>
          <dict/>
          <key>inputMethod</key>
          <dict/>
          <key>shell</key>
          <dict/>
          <key>source</key>
          <dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key>
        <string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string>${esc(shellScript(launcher))}</string>
          <key>CheckedForUserDefaultShell</key>
          <true/>
          <key>inputMethod</key>
          <integer>1</integer>
          <key>shell</key>
          <string>/bin/bash</string>
          <key>source</key>
          <string></string>
        </dict>
        <key>BundleIdentifier</key>
        <string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key>
        <string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key>
        <false/>
        <key>CanShowWhenRun</key>
        <true/>
        <key>Category</key>
        <array>
          <string>AMCategoryUtilities</string>
        </array>
        <key>Class Name</key>
        <string>RunShellScriptAction</string>
        <key>InputUUID</key>
        <string>A1B2C3D4-0000-4000-8000-000000000001</string>
        <key>Keywords</key>
        <array>
          <string>Shell</string>
          <string>Script</string>
          <string>Command</string>
          <string>Run</string>
          <string>Unix</string>
        </array>
        <key>OutputUUID</key>
        <string>A1B2C3D4-0000-4000-8000-000000000002</string>
        <key>UUID</key>
        <string>A1B2C3D4-0000-4000-8000-000000000003</string>
        <key>UnlocalizedApplications</key>
        <array>
          <string>Automator</string>
        </array>
        <key>arguments</key>
        <dict>
          <key>0</key>
          <dict>
            <key>default value</key>
            <integer>0</integer>
            <key>name</key>
            <string>inputMethod</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>0</string>
          </dict>
          <key>1</key>
          <dict>
            <key>default value</key>
            <false/>
            <key>name</key>
            <string>CheckedForUserDefaultShell</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>1</string>
          </dict>
          <key>2</key>
          <dict>
            <key>default value</key>
            <string></string>
            <key>name</key>
            <string>source</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>2</string>
          </dict>
          <key>3</key>
          <dict>
            <key>default value</key>
            <string></string>
            <key>name</key>
            <string>COMMAND_STRING</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>3</string>
          </dict>
          <key>4</key>
          <dict>
            <key>default value</key>
            <string>/bin/sh</string>
            <key>name</key>
            <string>shell</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>4</string>
          </dict>
        </dict>
        <key>isViewVisible</key>
        <integer>1</integer>
        <key>location</key>
        <string>309.000000:253.000000</string>
        <key>nibPath</key>
        <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>connectors</key>
  <dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.fileSystemObject</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key>
    <integer>0</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
`
}

// ── Public API ────────────────────────────────────────────────────

/** What the service should launch: the binary, plus the app dir in dev. */
function getLauncher() {
  const { app } = require('electron')
  return {
    exe:     process.execPath,
    appPath: app.isPackaged ? null : app.getAppPath(),
  }
}

async function register() {
  const dir = workflowPath()
  const contents = path.join(dir, 'Contents')

  fs.mkdirSync(contents, { recursive: true })
  fs.writeFileSync(path.join(contents, 'Info.plist'), infoPlist(), 'utf8')
  fs.writeFileSync(path.join(contents, 'document.wflow'), documentWflow(getLauncher()), 'utf8')

  await flushServices()
}

async function unregister() {
  const dir = workflowPath()
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  await flushServices()
}

/**
 * Ask the pasteboard server to re-read the Services directory.
 * Without it the entry only turns up after a logout, which reads as "it did
 * not work". Failure is not fatal — the entry is on disk either way.
 */
function flushServices() {
  return new Promise(resolve => {
    execFile('/System/Library/CoreServices/pbs', ['-flush'], { timeout: 8000 }, () => resolve())
  })
}

module.exports = { register, unregister, isRegistered, workflowPath }
