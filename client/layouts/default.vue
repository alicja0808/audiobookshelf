<template>
  <div class="text-white max-h-screen h-screen overflow-hidden bg-bg">
    <app-appbar />

    <Nuxt />

    <app-stream-container ref="streamContainer" />

    <modals-edit-modal />
    <modals-user-collections-modal />
    <modals-edit-collection-modal />
    <readers-reader />
  </div>
</template>

<script>
import CloseButton from '@/components/widgets/CloseButton'

export default {
  middleware: 'authenticated',
  data() {
    return {
      socket: null,
      isSocketConnected: false,
      isFirstSocketConnection: true,
      socketConnectionToastId: null
    }
  },
  watch: {
    $route(newVal) {
      if (this.$store.state.showEditModal) {
        this.$store.commit('setShowEditModal', false)
      }
      if (this.$store.state.selectedAudiobooks) {
        this.$store.commit('setSelectedAudiobooks', [])
      }
      if (this.$store.state.audiobooks.keywordFilter) {
        this.$store.commit('audiobooks/setKeywordFilter', '')
      }
    }
  },
  computed: {
    user() {
      return this.$store.state.user.user
    }
  },
  methods: {
    connect() {
      console.log('[SOCKET] Connected')
      var token = this.$store.getters['user/getToken']
      this.socket.emit('auth', token)

      if (this.socketConnectionToastId !== null) {
        this.$toast.update(this.socketConnectionToastId, { content: 'Socket Connected', options: { timeout: 5000, type: 'success', closeButton: false, position: 'bottom-center', onClose: () => null } }, true)
      } else if (!this.isFirstSocketConnection) {
        this.$toast.success('Socket Connected', { position: 'bottom-center' })
      }
      this.isFirstSocketConnection = false
      this.isSocketConnected = true
    },
    connectError() {
      console.error('[SOCKET] connect error')

      // if (this.socketConnectionToastId) {
      //    this.$toast.update(this.socketConnectionToastId, { content: 'Socket Connection Error', options: { timeout: 5000, type: 'error', closeButton: false, position: 'bottom-center', onClose: () => null } }, true)
      // } else {
      //   this.$toast.error('Socket Connection Error', { position: 'bottom-center' })
      // }
    },
    disconnect() {
      console.log('[SOCKET] Disconnected')
      this.isSocketConnected = false

      if (this.socketConnectionToastId !== null) {
        this.socketConnectionToastId = this.$toast.update(this.socketConnectionToastId, { content: 'Socket Disconnected', options: { timeout: null, type: 'error', closeButton: false, position: 'bottom-center', onClose: () => null } }, true)
      } else {
        this.socketConnectionToastId = this.$toast.error('Socket Disconnected', { timeout: null, position: 'bottom-center' })
      }
    },
    reconnect() {
      console.error('[SOCKET] reconnected')
    },
    reconnection_attempt(val) {
      console.log(`[SOCKET] Reconnection attempt ${val}`)
    },
    reconnectError() {
      console.error('[SOCKET] reconnect error')
    },
    reconnectFailed() {
      console.error('[SOCKET] reconnect failed')
    },
    init(payload) {
      console.log('Init Payload', payload)
      if (payload.stream) {
        if (this.$refs.streamContainer) {
          this.$store.commit('setStream', payload.stream)
          this.$refs.streamContainer.streamOpen(payload.stream)
        }
      }
      if (payload.user) {
        this.$store.commit('user/setUser', payload.user)
        this.$store.commit('user/setSettings', payload.user.settings)
      }
      if (payload.serverSettings) {
        this.$store.commit('setServerSettings', payload.serverSettings)
      }
      if (payload.librariesScanning) {
        payload.librariesScanning.forEach((libraryScan) => {
          this.scanStart(libraryScan)
        })
      }
      if (payload.backups && payload.backups.length) {
        this.$store.commit('setBackups', payload.backups)
      }
      if (payload.usersOnline) {
        this.$store.commit('users/resetUsers')
        payload.usersOnline.forEach((user) => {
          this.$store.commit('users/updateUser', user)
        })
      }
    },
    streamOpen(stream) {
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamOpen(stream)
    },
    streamClosed(streamId) {
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamClosed(streamId)
    },
    streamProgress(data) {
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamProgress(data)
    },
    streamReady() {
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamReady()
    },
    streamReset(payload) {
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamReset(payload)
    },
    streamError({ id, errorMessage }) {
      this.$toast.error(`Stream Failed: ${errorMessage}`)
      if (this.$refs.streamContainer) this.$refs.streamContainer.streamError(id)
    },
    audiobookAdded(audiobook) {
      this.$store.commit('audiobooks/addUpdate', audiobook)
    },
    audiobookUpdated(audiobook) {
      this.$store.commit('audiobooks/addUpdate', audiobook)
    },
    audiobookRemoved(audiobook) {
      if (this.$route.name.startsWith('audiobook')) {
        if (this.$route.params.id === audiobook.id) {
          this.$router.replace(`/library/${this.$store.state.libraries.currentLibraryId}`)
        }
      }
      this.$store.commit('audiobooks/remove', audiobook)
    },
    libraryAdded(library) {
      this.$store.commit('libraries/addUpdate', library)
    },
    libraryUpdated(library) {
      this.$store.commit('libraries/addUpdate', library)
    },
    libraryRemoved(library) {
      this.$store.commit('libraries/remove', library)
    },
    scanComplete(data) {
      var message = `Scan "${data.name}" complete!`
      if (data.results) {
        var scanResultMsgs = []
        var results = data.results
        if (results.added) scanResultMsgs.push(`${results.added} added`)
        if (results.updated) scanResultMsgs.push(`${results.updated} updated`)
        if (results.removed) scanResultMsgs.push(`${results.removed} removed`)
        if (results.missing) scanResultMsgs.push(`${results.missing} missing`)
        if (!scanResultMsgs.length) message += '\nEverything was up to date'
        else message += '\n' + scanResultMsgs.join('\n')
      } else {
        message = `Scan "${data.name}" was canceled`
      }

      var existingScan = this.$store.getters['scanners/getLibraryScan'](data.id)
      if (existingScan && !isNaN(existingScan.toastId)) {
        this.$toast.update(existingScan.toastId, { content: message, options: { timeout: 5000, type: 'success', closeButton: false, position: 'bottom-center', onClose: () => null } }, true)
      } else {
        this.$toast.success(message, { timeout: 5000, position: 'bottom-center' })
      }

      this.$store.commit('scanners/remove', data)
    },
    onScanToastCancel(id) {
      this.$root.socket.emit('cancel_scan', id)
    },
    scanStart(data) {
      data.toastId = this.$toast(`Scanning "${data.name}"...`, { timeout: false, type: 'info', draggable: false, closeOnClick: false, closeButton: CloseButton, closeButtonClassName: 'cancel-scan-btn', showCloseButtonOnHover: false, position: 'bottom-center', onClose: () => this.onScanToastCancel(data.id) })
      this.$store.commit('scanners/addUpdate', data)
    },
    scanProgress(data) {
      var existingScan = this.$store.getters['scanners/getLibraryScan'](data.id)
      if (existingScan && !isNaN(existingScan.toastId)) {
        data.toastId = existingScan.toastId
        this.$toast.update(existingScan.toastId, { content: `Scanning "${existingScan.name}"... ${data.progress.progress || 0}%`, options: { timeout: false } }, true)
      } else {
        data.toastId = this.$toast(`Scanning "${data.name}"...`, { timeout: false, type: 'info', draggable: false, closeOnClick: false, closeButton: CloseButton, closeButtonClassName: 'cancel-scan-btn', showCloseButtonOnHover: false, position: 'bottom-center', onClose: () => this.onScanToastCancel(data.id) })
      }

      this.$store.commit('scanners/addUpdate', data)
    },
    userUpdated(user) {
      if (this.$store.state.user.user.id === user.id) {
        this.$store.commit('user/setUser', user)
        this.$store.commit('user/setSettings', user.settings)
      }
    },
    userOnline(user) {
      this.$store.commit('users/updateUser', user)
    },
    userOffline(user) {
      this.$store.commit('users/removeUser', user)
    },
    userStreamUpdate(user) {
      this.$store.commit('users/updateUser', user)
    },
    currentUserAudiobookUpdate(payload) {
      // console.log('Received user audiobook update', payload)
      this.$store.commit('user/updateUserAudiobook', payload)
    },
    collectionAdded(collection) {
      this.$store.commit('user/addUpdateCollection', collection)
    },
    collectionUpdated(collection) {
      this.$store.commit('user/addUpdateCollection', collection)
    },
    collectionRemoved(collection) {
      if (this.$route.name.startsWith('collection')) {
        if (this.$route.params.id === collection.id) {
          this.$router.replace(`/library/${this.$store.state.libraries.currentLibraryId}/bookshelf/collections`)
        }
      }
      this.$store.commit('user/removeCollection', collection)
    },
    downloadToastClick(download) {
      if (!download || !download.audiobookId) {
        return console.error('Invalid download object', download)
      }

      var audiobook = this.$store.getters['audiobooks/getAudiobook'](download.audiobookId)
      if (!audiobook) {
        return console.error('Audiobook not found for download', download)
      }
      this.$store.commit('showEditModalOnTab', { audiobook, tab: 'download' })
    },
    downloadStarted(download) {
      download.status = this.$constants.DownloadStatus.PENDING
      download.toastId = this.$toast(`Preparing download "${download.filename}"`, { timeout: false, draggable: false, closeOnClick: false, onClick: () => this.downloadToastClick(download) })
      this.$store.commit('downloads/addUpdateDownload', download)
    },
    downloadReady(download) {
      download.status = this.$constants.DownloadStatus.READY
      var existingDownload = this.$store.getters['downloads/getDownload'](download.id)

      if (existingDownload && existingDownload.toastId !== undefined) {
        download.toastId = existingDownload.toastId
        this.$toast.update(existingDownload.toastId, { content: `Download "${download.filename}" is ready!`, options: { timeout: 5000, type: 'success', onClick: () => this.downloadToastClick(download) } }, true)
      } else {
        this.$toast.success(`Download "${download.filename}" is ready!`)
      }
      this.$store.commit('downloads/addUpdateDownload', download)
    },
    downloadFailed(download) {
      download.status = this.$constants.DownloadStatus.FAILED
      var existingDownload = this.$store.getters['downloads/getDownload'](download.id)

      var failedMsg = download.isTimedOut ? 'timed out' : 'failed'

      if (existingDownload && existingDownload.toastId !== undefined) {
        download.toastId = existingDownload.toastId
        this.$toast.update(existingDownload.toastId, { content: `Download "${download.filename}" ${failedMsg}`, options: { timeout: 5000, type: 'error', onClick: () => this.downloadToastClick(download) } }, true)
      } else {
        console.warn('Download failed no existing download', existingDownload)
        this.$toast.error(`Download "${download.filename}" ${failedMsg}`)
      }
      this.$store.commit('downloads/addUpdateDownload', download)
    },
    downloadKilled(download) {
      var existingDownload = this.$store.getters['downloads/getDownload'](download.id)
      if (existingDownload && existingDownload.toastId !== undefined) {
        download.toastId = existingDownload.toastId
        this.$toast.update(existingDownload.toastId, { content: `Download "${download.filename}" was terminated`, options: { timeout: 5000, type: 'error', onClick: () => this.downloadToastClick(download) } }, true)
      } else {
        console.warn('Download killed no existing download found', existingDownload)
        this.$toast.error(`Download "${download.filename}" was terminated`)
      }
      this.$store.commit('downloads/removeDownload', download)
    },
    downloadExpired(download) {
      download.status = this.$constants.DownloadStatus.EXPIRED
      this.$store.commit('downloads/addUpdateDownload', download)
    },
    showErrorToast(message) {
      this.$toast.error(message)
    },
    showSuccessToast(message) {
      this.$toast.success(message)
    },
    backupApplied() {
      // Force refresh
      location.reload()
    },
    initializeSocket() {
      this.socket = this.$nuxtSocket({
        name: process.env.NODE_ENV === 'development' ? 'dev' : 'prod',
        persist: 'main',
        teardown: false,
        transports: ['websocket'],
        upgrade: false,
        reconnection: true
      })
      this.$root.socket = this.socket

      this.socket.on('connect', this.connect)
      this.socket.on('connect_error', this.connectError)
      this.socket.on('disconnect', this.disconnect)
      this.socket.io.on('reconnection_attempt', this.reconnection_attempt)
      this.socket.io.on('reconnect', this.reconnect)
      this.socket.io.on('reconnect_error', this.reconnectError)
      this.socket.io.on('reconnect_failed', this.reconnectFailed)

      this.socket.on('init', this.init)

      // Stream Listeners
      this.socket.on('stream_open', this.streamOpen)
      this.socket.on('stream_closed', this.streamClosed)
      this.socket.on('stream_progress', this.streamProgress)
      this.socket.on('stream_ready', this.streamReady)
      this.socket.on('stream_reset', this.streamReset)
      this.socket.on('stream_error', this.streamError)

      // Audiobook Listeners
      this.socket.on('audiobook_updated', this.audiobookUpdated)
      this.socket.on('audiobook_added', this.audiobookAdded)
      this.socket.on('audiobook_removed', this.audiobookRemoved)

      // Library Listeners
      this.socket.on('library_updated', this.libraryUpdated)
      this.socket.on('library_added', this.libraryAdded)
      this.socket.on('library_removed', this.libraryRemoved)

      // User Listeners
      this.socket.on('user_updated', this.userUpdated)
      this.socket.on('user_online', this.userOnline)
      this.socket.on('user_offline', this.userOffline)
      this.socket.on('user_stream_update', this.userStreamUpdate)
      this.socket.on('current_user_audiobook_update', this.currentUserAudiobookUpdate)

      // User Collection Listeners
      this.socket.on('collection_added', this.collectionAdded)
      this.socket.on('collection_updated', this.collectionUpdated)
      this.socket.on('collection_removed', this.collectionRemoved)

      // Scan Listeners
      this.socket.on('scan_start', this.scanStart)
      this.socket.on('scan_complete', this.scanComplete)
      this.socket.on('scan_progress', this.scanProgress)

      // Download Listeners
      this.socket.on('download_started', this.downloadStarted)
      this.socket.on('download_ready', this.downloadReady)
      this.socket.on('download_failed', this.downloadFailed)
      this.socket.on('download_killed', this.downloadKilled)
      this.socket.on('download_expired', this.downloadExpired)

      // Toast Listeners
      this.socket.on('show_error_toast', this.showErrorToast)
      this.socket.on('show_success_toast', this.showSuccessToast)

      this.socket.on('backup_applied', this.backupApplied)
    },
    showUpdateToast(versionData) {
      var ignoreVersion = localStorage.getItem('ignoreVersion')
      var latestVersion = versionData.latestVersion

      if (!ignoreVersion || ignoreVersion !== latestVersion) {
        this.$toast.info(`Update is available!\nCheck release notes for v${versionData.latestVersion}`, {
          position: 'top-center',
          toastClassName: 'cursor-pointer',
          bodyClassName: 'custom-class-1',
          timeout: 20000,
          closeOnClick: false,
          draggable: false,
          hideProgressBar: false,
          onClick: () => {
            window.open(versionData.githubTagUrl, '_blank')
          },
          onClose: () => {
            localStorage.setItem('ignoreVersion', versionData.latestVersion)
          }
        })
      } else {
        console.warn(`Update is available but user chose to dismiss it! v${versionData.latestVersion}`)
      }
    },
    checkActiveElementIsInput() {
      var activeElement = document.activeElement
      var inputs = ['input', 'select', 'button', 'textarea']
      return activeElement && inputs.indexOf(activeElement.tagName.toLowerCase()) !== -1
    },
    getHotkeyName(e) {
      var keyCode = e.keyCode || e.which
      if (!this.$keynames[keyCode]) {
        // Unused hotkey
        return null
      }

      var keyName = this.$keynames[keyCode]
      var name = keyName
      if (e.shiftKey) name = 'Shift-' + keyName
      if (process.env.NODE_ENV !== 'production') {
        console.log('Hotkey command', name)
      }
      return name
    },
    keyDown(e) {
      var name = this.getHotkeyName(e)
      if (!name) return

      // Input is focused then ignore key press
      if (this.checkActiveElementIsInput()) {
        return
      }

      // Modal is open
      if (this.$store.state.openModal && Object.values(this.$hotkeys.Modal).includes(name)) {
        this.$eventBus.$emit('modal-hotkey', name)
        e.preventDefault()
        return
      }

      // EReader is open
      if (this.$store.state.showEReader && Object.values(this.$hotkeys.EReader).includes(name)) {
        this.$eventBus.$emit('reader-hotkey', name)
        e.preventDefault()
        return
      }

      // Batch selecting
      if (this.$store.getters['getNumAudiobooksSelected'] && name === 'Escape') {
        // ESCAPE key cancels batch selection
        this.$store.commit('setSelectedAudiobooks', [])
        e.preventDefault()
        return
      }

      // Playing audiobook
      if (this.$store.state.streamAudiobook && Object.values(this.$hotkeys.AudioPlayer).includes(name)) {
        this.$eventBus.$emit('player-hotkey', name)
        e.preventDefault()
      }
    }
  },
  mounted() {
    window.addEventListener('keydown', this.keyDown)

    this.initializeSocket()
    this.$store.dispatch('libraries/load')

    // If experimental features set in local storage
    var experimentalFeaturesSaved = localStorage.getItem('experimental')
    if (experimentalFeaturesSaved === '1') {
      this.$store.commit('setExperimentalFeatures', true)
    }

    this.$store
      .dispatch('checkForUpdate')
      .then((res) => {
        if (res && res.hasUpdate) this.showUpdateToast(res)
      })
      .catch((err) => console.error(err))

    if (this.$route.query.error) {
      this.$toast.error(this.$route.query.error)
      this.$router.replace(this.$route.path)
    }
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.keyDown)
  }
}
</script>

<style>
.Vue-Toastification__toast-body.custom-class-1 {
  font-size: 14px;
}
</style>