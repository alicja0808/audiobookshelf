const Logger = require('../Logger')

class BookController {
  constructor(db, emitter, clientEmitter, streamManager, coverController) {
    this.db = db
    this.emitter = emitter
    this.clientEmitter = clientEmitter
    this.streamManager = streamManager
    this.coverController = coverController
  }

  findAll(req, res) {
    var audiobooks = []
    if (req.query.q) {
      audiobooks = this.db.audiobooks.filter(ab => {
        return ab.isSearchMatch(req.query.q)
      }).map(ab => ab.toJSONMinified())
    } else {
      audiobooks = this.db.audiobooks.map(ab => ab.toJSONMinified())
    }
    res.json(audiobooks)
  }

  findOne(req, res) {
    if (!req.user) {
      return res.sendStatus(403)
    }
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)

    // Check user can access this audiobooks library
    if (!req.user.checkCanAccessLibrary(audiobook.libraryId)) {
      return res.sendStatus(403)
    }

    res.json(audiobook.toJSONExpanded())
  }

  async update(req, res) {
    if (!req.user.canUpdate) {
      Logger.warn('User attempted to update without permission', req.user)
      return res.sendStatus(403)
    }
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)
    var hasUpdates = audiobook.update(req.body)
    if (hasUpdates) {
      await this.db.updateAudiobook(audiobook)
    }
    this.emitter('audiobook_updated', audiobook.toJSONMinified())
    res.json(audiobook.toJSON())
  }

  async delete(req, res) {
    if (!req.user.canDelete) {
      Logger.warn('User attempted to delete without permission', req.user)
      return res.sendStatus(403)
    }
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)

    await this.handleDeleteAudiobook(audiobook)
    res.sendStatus(200)
  }

  // DELETE: api/books/all
  async deleteAll(req, res) {
    if (!req.user.isRoot) {
      Logger.warn('User other than root attempted to delete all audiobooks', req.user)
      return res.sendStatus(403)
    }
    Logger.info('Removing all Audiobooks')
    var success = await this.db.recreateAudiobookDb()
    if (success) res.sendStatus(200)
    else res.sendStatus(500)
  }


  // POST: api/books/batch/delete
  async batchDelete(req, res) {
    if (!req.user.canDelete) {
      Logger.warn('User attempted to delete without permission', req.user)
      return res.sendStatus(403)
    }
    var { audiobookIds } = req.body
    if (!audiobookIds || !audiobookIds.length) {
      return res.sendStatus(500)
    }

    var audiobooksToDelete = this.db.audiobooks.filter(ab => audiobookIds.includes(ab.id))
    if (!audiobooksToDelete.length) {
      return res.sendStatus(404)
    }
    for (let i = 0; i < audiobooksToDelete.length; i++) {
      Logger.info(`[ApiController] Deleting Audiobook "${audiobooksToDelete[i].title}"`)
      await this.handleDeleteAudiobook(audiobooksToDelete[i])
    }
    res.sendStatus(200)
  }

  // POST: api/books/batch/update
  async batchUpdate(req, res) {
    if (!req.user.canUpdate) {
      Logger.warn('User attempted to batch update without permission', req.user)
      return res.sendStatus(403)
    }
    var audiobooks = req.body
    if (!audiobooks || !audiobooks.length) {
      return res.sendStatus(500)
    }

    var audiobooksUpdated = 0
    audiobooks = audiobooks.map((ab) => {
      var _ab = this.db.audiobooks.find(__ab => __ab.id === ab.id)
      if (!_ab) return null
      var hasUpdated = _ab.update(ab)
      if (!hasUpdated) return null
      audiobooksUpdated++
      return _ab
    }).filter(ab => ab)

    if (audiobooksUpdated) {
      Logger.info(`[ApiController] ${audiobooksUpdated} Audiobooks have updates`)
      for (let i = 0; i < audiobooks.length; i++) {
        await this.db.updateAudiobook(audiobooks[i])
        this.emitter('audiobook_updated', audiobooks[i].toJSONMinified())
      }
    }

    res.json({
      success: true,
      updates: audiobooksUpdated
    })
  }

  // PATCH: api/books/:id/tracks
  async updateTracks(req, res) {
    if (!req.user.canUpdate) {
      Logger.warn('User attempted to update audiotracks without permission', req.user)
      return res.sendStatus(403)
    }
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)
    var orderedFileData = req.body.orderedFileData
    Logger.info(`Updating audiobook tracks called ${audiobook.id}`)
    audiobook.updateAudioTracks(orderedFileData)
    await this.db.updateAudiobook(audiobook)
    this.emitter('audiobook_updated', audiobook.toJSONMinified())
    res.json(audiobook.toJSON())
  }

  // GET: api/books/:id/stream
  openStream(req, res) {
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)

    this.streamManager.openStreamApiRequest(res, req.user, audiobook)
  }

  // POST: api/books/:id/cover
  async uploadCover(req, res) {
    if (!req.user.canUpload || !req.user.canUpdate) {
      Logger.warn('User attempted to upload a cover without permission', req.user)
      return res.sendStatus(403)
    }

    var audiobookId = req.params.id
    var audiobook = this.db.audiobooks.find(ab => ab.id === audiobookId)
    if (!audiobook) {
      return res.status(404).send('Audiobook not found')
    }

    var result = null
    if (req.body && req.body.url) {
      Logger.debug(`[ApiController] Requesting download cover from url "${req.body.url}"`)
      result = await this.coverController.downloadCoverFromUrl(audiobook, req.body.url)
    } else if (req.files && req.files.cover) {
      Logger.debug(`[ApiController] Handling uploaded cover`)
      var coverFile = req.files.cover
      result = await this.coverController.uploadCover(audiobook, coverFile)
    } else {
      return res.status(400).send('Invalid request no file or url')
    }

    if (result && result.error) {
      return res.status(400).send(result.error)
    } else if (!result || !result.cover) {
      return res.status(500).send('Unknown error occurred')
    }

    await this.db.updateAudiobook(audiobook)
    this.emitter('audiobook_updated', audiobook.toJSONMinified())
    res.json({
      success: true,
      cover: result.cover
    })
  }

  // PATCH api/books/:id/coverfile
  async updateCoverFromFile(req, res) {
    if (!req.user.canUpdate) {
      Logger.warn('User attempted to update without permission', req.user)
      return res.sendStatus(403)
    }
    var audiobook = this.db.audiobooks.find(a => a.id === req.params.id)
    if (!audiobook) return res.sendStatus(404)

    var coverFile = req.body
    var updated = await audiobook.setCoverFromFile(coverFile)

    if (updated) {
      await this.db.updateAudiobook(audiobook)
      this.emitter('audiobook_updated', audiobook.toJSONMinified())
    }

    if (updated) res.status(200).send('Cover updated successfully')
    else res.status(200).send('No update was made to cover')
  }
}
module.exports = new BookController()