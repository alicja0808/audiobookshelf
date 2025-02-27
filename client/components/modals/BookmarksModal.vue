<template>
  <modals-modal v-model="show" name="bookmarks" :width="500" :height="'unset'">
    <div ref="container" class="w-full rounded-lg bg-primary box-shadow-md overflow-y-auto overflow-x-hidden" style="max-height: 80vh">
      <div v-if="show" class="w-full h-full">
        <template v-for="bookmark in bookmarks">
          <modals-bookmarks-bookmark-item :key="bookmark.id" :highlight="currentTime === bookmark.time" :bookmark="bookmark" @click="clickBookmark" @update="submitUpdateBookmark" @delete="deleteBookmark" />
        </template>
        <div v-if="!bookmarks.length" class="flex h-32 items-center justify-center">
          <p class="text-xl">No Bookmarks</p>
        </div>
        <div class="w-full h-px bg-white bg-opacity-10" />
        <form @submit.prevent="submitCreateBookmark">
          <div v-show="canCreateBookmark" class="flex px-4 py-2 items-center text-center border-b border-white border-opacity-10 text-white text-opacity-80">
            <div class="w-16 max-w-16 text-center">
              <p class="text-sm font-mono text-gray-400">
                {{ this.$secondsToTimestamp(currentTime) }}
              </p>
            </div>
            <div class="flex-grow px-2">
              <ui-text-input v-model="newBookmarkTitle" placeholder="Note" class="w-full" />
            </div>
            <ui-btn type="submit" color="success" :padding-x="4" class="h-10"><span class="material-icons -mt-px">add</span></ui-btn>
          </div>
        </form>
      </div>
    </div>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean,
    bookmarks: {
      type: Array,
      default: () => []
    },
    currentTime: {
      type: Number,
      default: 0
    },
    audiobookId: String
  },
  data() {
    return {
      selectedBookmark: null,
      showBookmarkTitleInput: false,
      newBookmarkTitle: ''
    }
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.showBookmarkTitleInput = false
        this.newBookmarkTitle = ''
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    canCreateBookmark() {
      return !this.bookmarks.find((bm) => bm.time === this.currentTime)
    }
  },
  methods: {
    editBookmark(bm) {
      this.selectedBookmark = bm
      this.newBookmarkTitle = bm.title
      this.showBookmarkTitleInput = true
    },
    deleteBookmark(bm) {
      var bookmark = { ...bm, audiobookId: this.audiobookId }
      this.$root.socket.emit('delete_bookmark', bookmark)
      this.show = false
    },
    clickBookmark(bm) {
      this.$emit('select', bm)
    },
    submitUpdateBookmark(updatedBookmark) {
      var bookmark = { ...updatedBookmark }
      bookmark.audiobookId = this.audiobookId

      this.$root.socket.emit('update_bookmark', bookmark)
      this.show = false
    },
    submitCreateBookmark() {
      if (!this.newBookmarkTitle) {
        this.newBookmarkTitle = this.$formatDate(Date.now(), 'MMM dd, yyyy HH:mm')
      }
      var bookmark = {
        audiobookId: this.audiobookId,
        title: this.newBookmarkTitle,
        time: this.currentTime
      }
      this.$root.socket.emit('create_bookmark', bookmark)

      this.newBookmarkTitle = ''
      this.showBookmarkTitleInput = false

      this.show = false
    }
  }
}
</script>