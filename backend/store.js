const Store = require('electron-store')

const store = new Store({
  name: 'config',
  defaults: {
    language: 'en',
    defaultSuffix: '_converted',
    defaultBitrate: '320k',
    metadataSortField: 'name',
    ffmpegPath: '',
    recentFolders: [],
    windowBounds: { width: 1280, height: 800 },
  },
})

module.exports = store
