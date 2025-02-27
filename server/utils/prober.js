var Ffmpeg = require('fluent-ffmpeg')
const Path = require('path')
const Logger = require('../Logger')

function tryGrabBitRate(stream, all_streams, total_bit_rate) {
  if (!isNaN(stream.bit_rate) && stream.bit_rate) {
    return Number(stream.bit_rate)
  }
  if (!stream.tags) {
    return null
  }

  // Attempt to get bitrate from bps tags
  var bps = stream.tags.BPS || stream.tags['BPS-eng'] || stream.tags['BPS_eng']
  if (bps && !isNaN(bps)) {
    return Number(bps)
  }

  var tagDuration = stream.tags.DURATION || stream.tags['DURATION-eng'] || stream.tags['DURATION_eng']
  var tagBytes = stream.tags.NUMBER_OF_BYTES || stream.tags['NUMBER_OF_BYTES-eng'] || stream.tags['NUMBER_OF_BYTES_eng']
  if (tagDuration && tagBytes && !isNaN(tagDuration) && !isNaN(tagBytes)) {
    var bps = Math.floor(Number(tagBytes) * 8 / Number(tagDuration))
    if (bps && !isNaN(bps)) {
      return bps
    }
  }

  if (total_bit_rate && stream.codec_type === 'video') {
    var estimated_bit_rate = total_bit_rate
    all_streams.forEach((stream) => {
      if (stream.bit_rate && !isNaN(stream.bit_rate)) {
        estimated_bit_rate -= Number(stream.bit_rate)
      }
    })
    if (!all_streams.find(s => s.codec_type === 'audio' && s.bit_rate && Number(s.bit_rate) > estimated_bit_rate)) {
      return estimated_bit_rate
    } else {
      return total_bit_rate
    }
  } else if (stream.codec_type === 'audio') {
    return 112000
  } else {
    return 0
  }
}

function tryGrabFrameRate(stream) {
  var avgFrameRate = stream.avg_frame_rate || stream.r_frame_rate
  if (!avgFrameRate) return null
  var parts = avgFrameRate.split('/')
  if (parts.length === 2) {
    avgFrameRate = Number(parts[0]) / Number(parts[1])
  } else {
    avgFrameRate = Number(parts[0])
  }
  if (!isNaN(avgFrameRate)) return avgFrameRate
  return null
}

function tryGrabSampleRate(stream) {
  var sample_rate = stream.sample_rate
  if (!isNaN(sample_rate)) return Number(sample_rate)
  return null
}

function tryGrabChannelLayout(stream) {
  var layout = stream.channel_layout
  if (!layout) return null
  return String(layout).split('(').shift()
}

function tryGrabTag(stream, tag) {
  if (!stream.tags) return null
  return stream.tags[tag] || stream.tags[tag.toUpperCase()] || null
}

function tryGrabTags(stream, ...tags) {
  if (!stream.tags) return null
  for (let i = 0; i < tags.length; i++) {
    var value = stream.tags[tags[i]] || stream.tags[tags[i].toUpperCase()]
    if (value) return value
  }
  return null
}

function parseMediaStreamInfo(stream, all_streams, total_bit_rate) {
  var info = {
    index: stream.index,
    type: stream.codec_type,
    codec: stream.codec_name || null,
    codec_long: stream.codec_long_name || null,
    codec_time_base: stream.codec_time_base || null,
    time_base: stream.time_base || null,
    bit_rate: tryGrabBitRate(stream, all_streams, total_bit_rate),
    language: tryGrabTag(stream, 'language'),
    title: tryGrabTag(stream, 'title')
  }

  if (info.type === 'audio' || info.type === 'subtitle') {
    var disposition = stream.disposition || {}
    info.is_default = disposition.default === 1 || disposition.default === '1'
  }

  if (info.type === 'video') {
    info.profile = stream.profile || null
    info.is_avc = (stream.is_avc !== '0' && stream.is_avc !== 'false')
    info.pix_fmt = stream.pix_fmt || null
    info.frame_rate = tryGrabFrameRate(stream)
    info.width = !isNaN(stream.width) ? Number(stream.width) : null
    info.height = !isNaN(stream.height) ? Number(stream.height) : null
    info.color_range = stream.color_range || null
    info.color_space = stream.color_space || null
    info.color_transfer = stream.color_transfer || null
    info.color_primaries = stream.color_primaries || null
  } else if (stream.codec_type === 'audio') {
    info.channels = stream.channels || null
    info.sample_rate = tryGrabSampleRate(stream)
    info.channel_layout = tryGrabChannelLayout(stream)
  }

  return info
}

function parseChapters(chapters) {
  if (!chapters) return []
  return chapters.map(chap => {
    var title = chap['TAG:title'] || chap.title || ''
    var timebase = chap.time_base && chap.time_base.includes('/') ? Number(chap.time_base.split('/')[1]) : 1
    return {
      id: chap.id,
      start: !isNaN(chap.start_time) ? chap.start_time : (chap.start / timebase),
      end: chap.end_time || (chap.end / timebase),
      title
    }
  })
}

function parseTags(format, verbose) {
  if (!format.tags) {
    return {}
  }
  if (verbose) {
    Logger.debug('Tags', format.tags)
  }
  const tags = {
    file_tag_encoder: tryGrabTags(format, 'encoder', 'tsse', 'tss'),
    file_tag_encodedby: tryGrabTags(format, 'encoded_by', 'tenc', 'ten'),
    file_tag_title: tryGrabTags(format, 'title', 'tit2', 'tt2'),
    file_tag_subtitle: tryGrabTags(format, 'subtitle', 'tit3', 'tt3'),
    file_tag_track: tryGrabTags(format, 'track', 'trck', 'trk'),
    file_tag_album: tryGrabTags(format, 'album', 'talb', 'tal'),
    file_tag_artist: tryGrabTags(format, 'artist', 'tpe1', 'tp1'),
    file_tag_albumartist: tryGrabTags(format, 'albumartist', 'tpe2'),
    file_tag_date: tryGrabTags(format, 'date', 'tyer', 'tye'),
    file_tag_composer: tryGrabTags(format, 'composer', 'tcom', 'tcm'),
    file_tag_publisher: tryGrabTags(format, 'publisher', 'tpub', 'tpb'),
    file_tag_comment: tryGrabTags(format, 'comment', 'comm', 'com'),
    file_tag_description: tryGrabTags(format, 'description', 'desc'),
    file_tag_genre: tryGrabTags(format, 'genre', 'tcon', 'tco'),
    file_tag_series: tryGrabTag(format, 'series'),
    file_tag_seriespart: tryGrabTag(format, 'series-part'),

    // Not sure if these are actually used yet or not
    file_tag_creation_time: tryGrabTag(format, 'creation_time'),
    file_tag_wwwaudiofile: tryGrabTags(format, 'wwwaudiofile', 'woaf', 'waf'),
    file_tag_contentgroup: tryGrabTags(format, 'contentgroup', 'tit1', 'tt1'),
    file_tag_releasetime: tryGrabTags(format, 'releasetime', 'tdrl'),
    file_tag_movementname: tryGrabTags(format, 'movementname', 'mvnm'),
    file_tag_movement: tryGrabTags(format, 'movement', 'mvin'),
    file_tag_genre1: tryGrabTags(format, 'tmp_genre1', 'genre1'),
    file_tag_genre2: tryGrabTags(format, 'tmp_genre2', 'genre2'),
  }
  for (const key in tags) {
    if (!tags[key]) {
      delete tags[key]
    }
  }

  var keysToLookOutFor = ['file_tag_genre1', 'file_tag_genre2', 'file_tag_series', 'file_tag_seriespart', 'file_tag_movement', 'file_tag_movementname', 'file_tag_wwwaudiofile', 'file_tag_contentgroup', 'file_tag_releasetime']
  keysToLookOutFor.forEach((key) => {
    if (tags[key]) {
      Logger.debug(`Notable! ${key} => ${tags[key]}`)
    }
  })
  return tags
}

function parseProbeData(data, verbose = false) {
  try {
    var { format, streams, chapters } = data
    var { format_long_name, duration, size, bit_rate } = format

    var sizeBytes = !isNaN(size) ? Number(size) : null
    var sizeMb = sizeBytes !== null ? Number((sizeBytes / (1024 * 1024)).toFixed(2)) : null

    // Logger.debug('Parsing Data for', Path.basename(format.filename))
    var tags = parseTags(format, verbose)
    var cleanedData = {
      format: format_long_name,
      duration: !isNaN(duration) ? Number(duration) : null,
      size: sizeBytes,
      sizeMb,
      bit_rate: !isNaN(bit_rate) ? Number(bit_rate) : null,
      ...tags
    }
    if (verbose && format.tags) {
      cleanedData.rawTags = format.tags
    }

    const cleaned_streams = streams.map(s => parseMediaStreamInfo(s, streams, cleanedData.bit_rate))
    cleanedData.video_stream = cleaned_streams.find(s => s.type === 'video')
    cleanedData.audio_streams = cleaned_streams.filter(s => s.type === 'audio')
    cleanedData.subtitle_streams = cleaned_streams.filter(s => s.type === 'subtitle')

    if (cleanedData.audio_streams.length && cleanedData.video_stream) {
      var videoBitrate = cleanedData.video_stream.bit_rate
      // If audio stream bitrate larger then video, most likely incorrect
      if (cleanedData.audio_streams.find(astream => astream.bit_rate > videoBitrate)) {
        cleanedData.video_stream.bit_rate = cleanedData.bit_rate
      }
    }

    cleanedData.chapters = parseChapters(chapters)

    return cleanedData
  } catch (error) {
    console.error('Parse failed', error)
    return null
  }
}

function probe(filepath, verbose = false) {
  return new Promise((resolve) => {
    Ffmpeg.ffprobe(filepath, ['-show_chapters'], (err, raw) => {
      if (err) {
        console.error(err)
        resolve(null)
      } else {
        resolve(parseProbeData(raw, verbose))
      }
    })
  })
}
module.exports = probe