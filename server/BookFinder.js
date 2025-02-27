const OpenLibrary = require('./providers/OpenLibrary')
const LibGen = require('./providers/LibGen')
const GoogleBooks = require('./providers/GoogleBooks')
const Audible = require('./providers/Audible')
const Logger = require('./Logger')
const { levenshteinDistance } = require('./utils/index')

class BookFinder {
  constructor() {
    this.openLibrary = new OpenLibrary()
    this.libGen = new LibGen()
    this.googleBooks = new GoogleBooks()
    this.audible = new Audible()

    this.verbose = false
  }

  async findByISBN(isbn) {
    var book = await this.openLibrary.isbnLookup(isbn)
    if (book.errorCode) {
      Logger.error('Book not found')
    }
    return book
  }

  stripSubtitle(title) {
    if (title.includes(':')) {
      return title.split(':')[0].trim()
    } else if (title.includes(' - ')) {
      return title.split(' - ')[0].trim()
    }
    return title
  }

  replaceAccentedChars(str) {
    try {
      return str.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
    } catch (error) {
      Logger.error('[BookFinder] str normalize error', error)
      return str
    }
  }

  cleanTitleForCompares(title) {
    if (!title) return ''
    // Remove subtitle if there (i.e. "Cool Book: Coolest Ever" becomes "Cool Book")
    var stripped = this.stripSubtitle(title)

    // Remove text in paranthesis (i.e. "Ender's Game (Ender's Saga)" becomes "Ender's Game")
    var cleaned = stripped.replace(/ *\([^)]*\) */g, "")

    // Remove single quotes (i.e. "Ender's Game" becomes "Enders Game")
    cleaned = cleaned.replace(/'/g, '')
    cleaned = this.replaceAccentedChars(cleaned)
    return cleaned.toLowerCase()
  }

  cleanAuthorForCompares(author) {
    if (!author) return ''
    var cleaned = this.replaceAccentedChars(author)
    return cleaned.toLowerCase()
  }

  filterSearchResults(books, title, author, maxTitleDistance, maxAuthorDistance) {
    var searchTitle = this.cleanTitleForCompares(title)
    var searchAuthor = this.cleanAuthorForCompares(author)
    return books.map(b => {
      b.cleanedTitle = this.cleanTitleForCompares(b.title)
      b.titleDistance = levenshteinDistance(b.cleanedTitle, title)

      // Total length of search (title or both title & author)
      b.totalPossibleDistance = b.title.length

      if (author) {
        if (!b.author) {
          b.authorDistance = author.length
        } else {
          b.totalPossibleDistance += b.author.length
          b.cleanedAuthor = this.cleanAuthorForCompares(b.author)

          var cleanedAuthorDistance = levenshteinDistance(b.cleanedAuthor, searchAuthor)
          var authorDistance = levenshteinDistance(b.author || '', author)

          // Use best distance
          b.authorDistance = Math.min(cleanedAuthorDistance, authorDistance)

          // Check book author contains searchAuthor
          if (searchAuthor.length > 4 && b.cleanedAuthor.includes(searchAuthor)) b.includesAuthor = searchAuthor
          else if (author.length > 4 && b.author.includes(author)) b.includesAuthor = author
        }
      }
      b.totalDistance = b.titleDistance + (b.authorDistance || 0)

      // Check book title contains the searchTitle
      if (searchTitle.length > 4 && b.cleanedTitle.includes(searchTitle)) b.includesTitle = searchTitle
      else if (title.length > 4 && b.title.includes(title)) b.includesTitle = title

      return b
    }).filter(b => {
      if (b.includesTitle) { // If search title was found in result title then skip over leven distance check
        if (this.verbose) Logger.debug(`Exact title was included in "${b.title}", Search: "${b.includesTitle}"`)
      } else if (b.titleDistance > maxTitleDistance) {
        if (this.verbose) Logger.debug(`Filtering out search result title distance = ${b.titleDistance}: "${b.cleanedTitle}"/"${searchTitle}"`)
        return false
      }

      if (author) {
        if (b.includesAuthor) { // If search author was found in result author then skip over leven distance check
          if (this.verbose) Logger.debug(`Exact author was included in "${b.author}", Search: "${b.includesAuthor}"`)
        } else if (b.authorDistance > maxAuthorDistance) {
          if (this.verbose) Logger.debug(`Filtering out search result "${b.author}", author distance = ${b.authorDistance}: "${b.author}"/"${author}"`)
          return false
        }
      }

      // If book total search length < 5 and was not exact match, then filter out
      if (b.totalPossibleDistance < 5 && b.totalDistance > 0) return false
      return true
    })
  }

  async getLibGenResults(title, author, maxTitleDistance, maxAuthorDistance) {
    var books = await this.libGen.search(title)
    if (this.verbose) Logger.debug(`LibGen Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`LibGen Search Error ${books.errorCode}`)
      return []
    }
    var booksFiltered = this.filterSearchResults(books, title, author, maxTitleDistance, maxAuthorDistance)
    if (!booksFiltered.length && books.length) {
      if (this.verbose) Logger.debug(`Search has ${books.length} matches, but no close title matches`)
    }
    return booksFiltered
  }

  async getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance) {
    var books = await this.openLibrary.searchTitle(title)
    if (this.verbose) Logger.debug(`OpenLib Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`OpenLib Search Error ${books.errorCode}`)
      return []
    }
    var booksFiltered = this.filterSearchResults(books, title, author, maxTitleDistance, maxAuthorDistance)
    if (!booksFiltered.length && books.length) {
      if (this.verbose) Logger.debug(`Search has ${books.length} matches, but no close title matches`)
    }
    return booksFiltered
  }

  async getGoogleBooksResults(title, author, maxTitleDistance, maxAuthorDistance) {
    var books = await this.googleBooks.search(title, author)
    if (this.verbose) Logger.debug(`GoogleBooks Book Search Results: ${books.length || 0}`)
    if (books.errorCode) {
      Logger.error(`GoogleBooks Search Error ${books.errorCode}`)
      return []
    }
    // Google has good sort
    return books
  }

  async getAudibleResults(title, author, maxTitleDistance, maxAuthorDistance) {
    var books = await this.audible.search(title, author);
    if (this.verbose) Logger.debug(`Audible Book Search Results: ${books.length || 0}`)
    if (!books) return []
    return books
  }

  async search(provider, title, author, options = {}) {
    var books = []
    var maxTitleDistance = !isNaN(options.titleDistance) ? Number(options.titleDistance) : 4
    var maxAuthorDistance = !isNaN(options.authorDistance) ? Number(options.authorDistance) : 4
    Logger.debug(`Cover Search: title: "${title}", author: "${author}", provider: ${provider}`)

    if (provider === 'google') {
      return this.getGoogleBooksResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'audible') {
      return this.getAudibleResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'libgen') {
      books = await this.getLibGenResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'openlibrary') {
      books = await this.getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance)
    } else if (provider === 'all') {
      var lbBooks = await this.getLibGenResults(title, author, maxTitleDistance, maxAuthorDistance)
      var olBooks = await this.getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance)
      books = books.concat(lbBooks, olBooks)
    } else {
      books = await this.getOpenLibResults(title, author, maxTitleDistance, maxAuthorDistance)
      var hasCloseMatch = books.find(b => (b.totalDistance < 2 && b.totalPossibleDistance > 6))
      if (!hasCloseMatch) {
        Logger.debug(`Book Search, openlib has no super close matches - get libgen results also`)
        var lbBooks = await this.getLibGenResults(title, author, maxTitleDistance, maxAuthorDistance)
        books = books.concat(lbBooks)
      }

      if (!books.length && author && options.fallbackTitleOnly) {
        Logger.debug(`Book Search, no matches for title and author.. check title only`)
        return this.search(provider, title, null, options)
      }
    }

    return books.sort((a, b) => {
      return a.totalDistance - b.totalDistance
    })
  }

  async findCovers(provider, title, author, options = {}) {
    var searchResults = await this.search(provider, title, author, options)
    Logger.debug(`[BookFinder] FindCovers search results: ${searchResults.length}`)

    var covers = []
    searchResults.forEach((result) => {
      if (result.covers && result.covers.length) {
        covers = covers.concat(result.covers)
      }
      if (result.cover) {
        covers.push(result.cover)
      }
    })
    return covers
  }
}
module.exports = BookFinder