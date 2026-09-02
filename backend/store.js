const Store = require('electron-store')
const path  = require('path')
const os    = require('os')

const store = new Store({
  name: 'config',
  defaults: {
    language: 'en',
    defaultSuffix: '_converted',
    defaultBitrate: '320k',
    backupFolder: path.join(os.homedir(), 'LocalPrep', 'Backups'),
    backupRetention: 'never',   // 'never' | '7' | '30' (days)
    updateBehavior: 'ask',      // 'auto' | 'ask' | 'never'
    lastUpdateCheck: null,      // ISO 8601 UTC — background checks only
    skippedVersion: null,       // version the user declined
    lastRunVersion: null,       // detects "we just updated"
    metadataSortField: 'name',
    ffmpegPath: '',
    recentFolders: [],
    windowBounds: { width: 1280, height: 800 },
  },
})

module.exports = store
