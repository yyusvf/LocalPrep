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
    metadataSortField: 'name',
    ffmpegPath: '',
    recentFolders: [],
    windowBounds: { width: 1280, height: 800 },
  },
})

module.exports = store
