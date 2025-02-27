const Ffmpeg = require('fluent-ffmpeg')
const EventEmitter = require('events')
const Path = require('path')
const fs = require('fs-extra')
const Logger = require('../Logger')
const { getId } = require('../utils/index')
const { secondsToTimestamp } = require('../utils/fileUtils')
const { writeConcatFile } = require('../utils/ffmpegHelpers')
const hlsPlaylistGenerator = require('../utils/hlsPlaylistGenerator')

const UserListeningSession = require('./UserListeningSession')

class Stream extends EventEmitter {
  constructor(streamPath, client, audiobook, transcodeOptions = {}) {
    super()

    this.id = getId('str')
    this.client = client
    this.audiobook = audiobook

    this.transcodeOptions = transcodeOptions

    this.segmentLength = 6
    this.maxSeekBackTime = 30
    this.streamPath = Path.join(streamPath, this.id)
    this.concatFilesPath = Path.join(this.streamPath, 'files.txt')
    this.playlistPath = Path.join(this.streamPath, 'output.m3u8')
    this.finalPlaylistPath = Path.join(this.streamPath, 'final-output.m3u8')
    this.startTime = 0

    this.ffmpeg = null
    this.loop = null
    this.isResetting = false
    this.isClientInitialized = false
    this.isTranscodeComplete = false
    this.segmentsCreated = new Set()
    this.furthestSegmentCreated = 0
    this.clientCurrentTime = 0

    this.listeningSession = new UserListeningSession()
    this.listeningSession.setData(audiobook, client.user)

    this.init()
  }

  get socket() {
    return this.client ? this.client.socket || null : null
  }

  get audiobookId() {
    return this.audiobook.id
  }

  get audiobookTitle() {
    return this.audiobook ? this.audiobook.title : null
  }

  get totalDuration() {
    return this.audiobook.totalDuration
  }

  get tracksAudioFileType() {
    if (!this.tracks.length) return null
    return this.tracks[0].ext.toLowerCase().slice(1)
  }

  get hlsSegmentType() {
    var hasFlac = this.tracks.find(t => t.ext.toLowerCase() === '.flac')
    return hasFlac ? 'fmp4' : 'mpegts'
  }

  get segmentBasename() {
    if (this.hlsSegmentType === 'fmp4') return 'output-%d.m4s'
    return 'output-%d.ts'
  }

  get segmentStartNumber() {
    if (!this.startTime) return 0
    return Math.floor(Math.max(this.startTime - this.maxSeekBackTime, 0) / this.segmentLength)
  }

  get numSegments() {
    var numSegs = Math.floor(this.totalDuration / this.segmentLength)
    if (this.totalDuration - (numSegs * this.segmentLength) > 0) {
      numSegs++
    }
    return numSegs
  }

  get tracks() {
    return this.audiobook.tracks
  }

  get clientUser() {
    return this.client ? this.client.user || {} : null
  }

  get userToken() {
    return this.clientUser ? this.clientUser.token : null
  }

  get clientUserAudiobooks() {
    return this.client ? this.clientUser.audiobooks || {} : null
  }

  get clientUserAudiobookData() {
    return this.client ? this.clientUserAudiobooks[this.audiobookId] : null
  }

  get clientPlaylistUri() {
    return `/hls/${this.id}/output.m3u8`
  }

  get clientProgress() {
    if (!this.clientCurrentTime) return 0
    var prog = Math.min(1, this.clientCurrentTime / this.totalDuration)
    return Number(prog.toFixed(3))
  }

  get isAACEncodable() {
    return ['mp4', 'm4a', 'm4b'].includes(this.tracksAudioFileType)
  }

  get transcodeForceAAC() {
    return !!this.transcodeOptions.forceAAC
  }

  toJSON() {
    return {
      id: this.id,
      clientId: this.client.id,
      userId: this.client.user.id,
      audiobook: this.audiobook.toJSONMinified(),
      segmentLength: this.segmentLength,
      playlistPath: this.playlistPath,
      clientPlaylistUri: this.clientPlaylistUri,
      clientCurrentTime: this.clientCurrentTime,
      startTime: this.startTime,
      segmentStartNumber: this.segmentStartNumber,
      isTranscodeComplete: this.isTranscodeComplete,
      lastUpdate: this.clientUserAudiobookData ? this.clientUserAudiobookData.lastUpdate : 0
    }
  }

  init() {
    if (this.clientUserAudiobookData) {
      var timeRemaining = this.totalDuration - this.clientUserAudiobookData.currentTime
      Logger.info('[STREAM] User has progress for audiobook', this.clientUserAudiobookData.progress, `Time Remaining: ${timeRemaining}s`)
      if (timeRemaining > 15) {
        this.startTime = this.clientUserAudiobookData.currentTime
        this.clientCurrentTime = this.startTime
      }
    }
  }

  async checkSegmentNumberRequest(segNum) {
    var segStartTime = segNum * this.segmentLength
    if (this.startTime > segStartTime) {
      Logger.warn(`[STREAM] Segment #${segNum} Request @${secondsToTimestamp(segStartTime)} is before start time (${secondsToTimestamp(this.startTime)}) - Reset Transcode`)
      await this.reset(segStartTime - (this.segmentLength * 2))
      return segStartTime
    } else if (this.isTranscodeComplete) {
      return false
    }

    var distanceFromFurthestSegment = segNum - this.furthestSegmentCreated
    if (distanceFromFurthestSegment > 10) {
      Logger.info(`Segment #${segNum} requested is ${distanceFromFurthestSegment} segments from latest (${secondsToTimestamp(segStartTime)}) - Reset Transcode`)
      await this.reset(segStartTime - (this.segmentLength * 2))
      return segStartTime
    }

    return false
  }

  updateClientCurrentTime(currentTime) {
    Logger.debug('[Stream] Updated client current time', secondsToTimestamp(currentTime))
    this.clientCurrentTime = currentTime
  }

  syncStream({ timeListened, currentTime }) {
    var syncLog = ''
    if (currentTime !== null && !isNaN(currentTime)) {
      syncLog = `Update client current time ${secondsToTimestamp(currentTime)}`
      this.clientCurrentTime = currentTime
    }
    var saveListeningSession = false
    if (timeListened && !isNaN(timeListened)) {

      // Check if listening session should roll to next day
      if (this.listeningSession.checkDateRollover()) {
        if (!this.clientUser) {
          Logger.error(`[Stream] Sync stream invalid client user`)
          return null
        }
        this.listeningSession = new UserListeningSession()
        this.listeningSession.setData(this.audiobook, this.clientUser)
        Logger.debug(`[Stream] Listening session rolled to next day`)
      }

      this.listeningSession.addListeningTime(timeListened)
      if (syncLog) syncLog += ' | '
      syncLog += `Add listening time ${timeListened}s, Total time listened ${this.listeningSession.timeListening}s`
      saveListeningSession = true
    }
    Logger.debug('[Stream]', syncLog)
    return saveListeningSession ? this.listeningSession : null
  }

  async generatePlaylist() {
    fs.ensureDirSync(this.streamPath)
    await hlsPlaylistGenerator(this.playlistPath, 'output', this.totalDuration, this.segmentLength, this.hlsSegmentType, this.userToken)
    return this.clientPlaylistUri
  }

  async checkFiles() {
    try {
      var files = await fs.readdir(this.streamPath)
      files.forEach((file) => {
        var extname = Path.extname(file)
        if (extname === '.ts' || extname === '.m4s') {
          var basename = Path.basename(file, extname)
          var num_part = basename.split('-')[1]
          var part_num = Number(num_part)
          this.segmentsCreated.add(part_num)
        }
      })

      if (!this.segmentsCreated.size) {
        Logger.warn('No Segments')
        return
      }

      if (this.segmentsCreated.size > 6 && !this.isClientInitialized) {
        this.isClientInitialized = true
        if (this.socket) {
          Logger.info(`[STREAM] ${this.id} notifying client that stream is ready`)
          this.socket.emit('stream_open', this.toJSON())
        }
      }

      var chunks = []
      var current_chunk = []
      var last_seg_in_chunk = -1

      var segments = Array.from(this.segmentsCreated).sort((a, b) => a - b);
      var lastSegment = segments[segments.length - 1]
      if (lastSegment > this.furthestSegmentCreated) {
        this.furthestSegmentCreated = lastSegment
      }

      segments.forEach((seg) => {
        if (!current_chunk.length || last_seg_in_chunk + 1 === seg) {
          last_seg_in_chunk = seg
          current_chunk.push(seg)
        } else {
          if (current_chunk.length === 1) chunks.push(current_chunk[0])
          else chunks.push(`${current_chunk[0]}-${current_chunk[current_chunk.length - 1]}`)
          last_seg_in_chunk = seg
          current_chunk = [seg]
        }
      })
      if (current_chunk.length) {
        if (current_chunk.length === 1) chunks.push(current_chunk[0])
        else chunks.push(`${current_chunk[0]}-${current_chunk[current_chunk.length - 1]}`)
      }

      var perc = (this.segmentsCreated.size * 100 / this.numSegments).toFixed(2) + '%'
      Logger.info('[STREAM-CHECK] Check Files', this.segmentsCreated.size, 'of', this.numSegments, perc, `Furthest Segment: ${this.furthestSegmentCreated}`)
      // Logger.debug('[STREAM-CHECK] Chunks', chunks.join(', '))

      if (this.socket) {
        this.socket.emit('stream_progress', {
          stream: this.id,
          percent: perc,
          chunks,
          numSegments: this.numSegments
        })
      }
    } catch (error) {
      Logger.error('Failed checking files', error)
    }
  }

  startLoop() {
    // Logger.info(`[Stream] ${this.audiobookTitle} (${this.id}) Start Loop`)
    if (this.socket) {
      this.socket.emit('stream_progress', { stream: this.id, chunks: [], numSegments: 0, percent: '0%' })
    }

    clearInterval(this.loop)
    var intervalId = setInterval(() => {
      if (!this.isTranscodeComplete) {
        this.checkFiles()
      } else {
        if (this.socket) {
          Logger.info(`[Stream] ${this.audiobookTitle} sending stream_ready`)
          this.socket.emit('stream_ready')
        }
        clearInterval(intervalId)
      }
    }, 2000)
    this.loop = intervalId
  }

  async start() {
    Logger.info(`[STREAM] START STREAM - Num Segments: ${this.numSegments}`)

    this.ffmpeg = Ffmpeg()

    var adjustedStartTime = Math.max(this.startTime - this.maxSeekBackTime, 0)
    var trackStartTime = await writeConcatFile(this.tracks, this.concatFilesPath, adjustedStartTime)

    this.ffmpeg.addInput(this.concatFilesPath)
    // seek_timestamp : https://ffmpeg.org/ffmpeg.html
    // the argument to the -ss option is considered an actual timestamp, and is not offset by the start time of the file
    //   fixes https://github.com/advplyr/audiobookshelf/issues/116
    this.ffmpeg.inputOption('-seek_timestamp 1')
    this.ffmpeg.inputFormat('concat')
    this.ffmpeg.inputOption('-safe 0')

    if (adjustedStartTime > 0) {
      const shiftedStartTime = adjustedStartTime - trackStartTime
      // Issues using exact fractional seconds i.e. 29.49814 - changing to 29.5s
      var startTimeS = Math.round(shiftedStartTime * 10) / 10 + 's'
      Logger.info(`[STREAM] Starting Stream at startTime ${secondsToTimestamp(adjustedStartTime)} (User startTime ${secondsToTimestamp(this.startTime)}) and Segment #${this.segmentStartNumber}`)
      this.ffmpeg.inputOption(`-ss ${startTimeS}`)

      this.ffmpeg.inputOption('-noaccurate_seek')
    }

    const logLevel = process.env.NODE_ENV === 'production' ? 'error' : 'warning'
    const audioCodec = (this.hlsSegmentType === 'fmp4' || this.tracksAudioFileType === 'opus' || this.transcodeForceAAC) ? 'aac' : 'copy'
    this.ffmpeg.addOption([
      `-loglevel ${logLevel}`,
      '-map 0:a',
      `-c:a ${audioCodec}`
    ])
    const hlsOptions = [
      '-f hls',
      "-copyts",
      "-avoid_negative_ts make_non_negative",
      "-max_delay 5000000",
      "-max_muxing_queue_size 2048",
      `-hls_time 6`,
      `-hls_segment_type ${this.hlsSegmentType}`,
      `-start_number ${this.segmentStartNumber}`,
      "-hls_playlist_type vod",
      "-hls_list_size 0",
      "-hls_allow_cache 0"
    ]
    if (this.hlsSegmentType === 'fmp4') {
      hlsOptions.push('-strict -2')
      // var fmp4InitFilename = Path.join(this.streamPath, 'init.mp4')
      var fmp4InitFilename = 'init.mp4'
      hlsOptions.push(`-hls_fmp4_init_filename ${fmp4InitFilename}`)
    }
    this.ffmpeg.addOption(hlsOptions)
    var segmentFilename = Path.join(this.streamPath, this.segmentBasename)
    this.ffmpeg.addOption(`-hls_segment_filename ${segmentFilename}`)
    this.ffmpeg.output(this.finalPlaylistPath)

    this.ffmpeg.on('start', (command) => {
      Logger.info('[INFO] FFMPEG transcoding started with command: ' + command)
      Logger.info('')
      if (this.isResetting) {
        // AAC encode is much slower
        const clearIsResettingTime = this.transcodeForceAAC ? 3000 : 500
        setTimeout(() => {
          Logger.info('[STREAM] Clearing isResetting')
          this.isResetting = false
          this.startLoop()
        }, clearIsResettingTime)
      } else {
        this.startLoop()
      }
    })

    this.ffmpeg.on('stderr', (stdErrline) => {
      Logger.info(stdErrline)
    })

    this.ffmpeg.on('error', (err, stdout, stderr) => {
      if (err.message && err.message.includes('SIGKILL')) {
        // This is an intentional SIGKILL
        Logger.info('[FFMPEG] Transcode Killed')
        this.ffmpeg = null
        clearInterval(this.loop)
      } else {
        Logger.error('Ffmpeg Err', '"' + err.message + '"')

        // Temporary workaround for https://github.com/advplyr/audiobookshelf/issues/172
        const aacErrorMsg = 'ffmpeg exited with code 1: Could not write header for output file #0 (incorrect codec parameters ?)'
        if (audioCodec === 'copy' && this.isAACEncodable && err.message && err.message.startsWith(aacErrorMsg)) {
          Logger.info(`[Stream] Re-attempting stream with AAC encode`)
          this.transcodeOptions.forceAAC = true
          this.reset(this.startTime)
        } else {
          // Close stream show error
          this.close(err.message)
        }
      }
    })

    this.ffmpeg.on('end', (stdout, stderr) => {
      Logger.info('[FFMPEG] Transcoding ended')
      // For very small fast load
      if (!this.isClientInitialized) {
        this.isClientInitialized = true
        if (this.socket) {
          Logger.info(`[STREAM] ${this.id} notifying client that stream is ready`)
          this.socket.emit('stream_open', this.toJSON())
        }
      }
      this.isTranscodeComplete = true
      this.ffmpeg = null
      clearInterval(this.loop)
    })

    this.ffmpeg.run()
  }

  async close(errorMessage = null) {
    clearInterval(this.loop)

    Logger.info('Closing Stream', this.id)
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL')
    }

    await fs.remove(this.streamPath).then(() => {
      Logger.info('Deleted session data', this.streamPath)
    }).catch((err) => {
      Logger.error('Failed to delete session data', err)
    })

    if (this.socket) {
      if (errorMessage) this.socket.emit('stream_error', { id: this.id, error: (errorMessage || '').trim() })
      else this.socket.emit('stream_closed', this.id)
    }

    this.emit('closed')
  }

  cancelTranscode() {
    clearInterval(this.loop)
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL')
    }
  }

  async waitCancelTranscode() {
    for (let i = 0; i < 20; i++) {
      if (!this.ffmpeg) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    Logger.error('[STREAM] Transcode never closed...')
    return false
  }

  async reset(time) {
    if (this.isResetting) {
      return Logger.info(`[STREAM] Stream ${this.id} already resetting`)
    }
    time = Math.max(0, time)
    this.isResetting = true

    if (this.ffmpeg) {
      this.cancelTranscode()
      await this.waitCancelTranscode()
    }

    this.isTranscodeComplete = false
    this.startTime = time
    this.clientCurrentTime = this.startTime
    Logger.info(`Stream Reset New Start Time ${secondsToTimestamp(this.startTime)}`)
    this.start()
  }
}
module.exports = Stream