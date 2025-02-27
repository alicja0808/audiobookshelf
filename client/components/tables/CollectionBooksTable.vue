<template>
  <div class="w-full bg-primary bg-opacity-40">
    <div class="w-full h-14 flex items-center px-4 bg-primary">
      <p>Collection List</p>
      <div class="w-6 h-6 bg-white bg-opacity-10 flex items-center justify-center rounded-full ml-2">
        <p class="font-mono text-sm">{{ books.length }}</p>
      </div>
      <div class="flex-grow" />
      <p v-if="totalDuration">{{ totalDurationPretty }}</p>
    </div>
    <draggable v-model="booksCopy" v-bind="dragOptions" class="list-group" handle=".drag-handle" draggable=".item" tag="div" @start="drag = true" @end="drag = false" @update="draggableUpdate">
      <transition-group type="transition" :name="!drag ? 'collection-book' : null">
        <template v-for="book in booksCopy">
          <tables-collection-book-table-row :key="book.id" :is-dragging="drag" :book="book" :collection-id="collectionId" class="item" :class="drag ? '' : 'collection-book-item'" @edit="editBook" />
        </template>
      </transition-group>
    </draggable>
  </div>
</template>

<script>
import draggable from 'vuedraggable'

export default {
  components: {
    draggable
  },
  props: {
    collectionId: String,
    books: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      drag: false,
      dragOptions: {
        animation: 200,
        group: 'description',
        ghostClass: 'ghost'
      },
      booksCopy: []
    }
  },
  watch: {
    books: {
      handler(newVal) {
        this.init()
      }
    }
  },
  computed: {
    totalDuration() {
      var _total = 0
      this.books.forEach((book) => {
        _total += book.duration
      })
      return _total
    },
    totalDurationPretty() {
      return this.$elapsedPretty(this.totalDuration)
    }
  },
  methods: {
    draggableUpdate() {
      var collectionUpdate = {
        books: this.booksCopy.map((b) => b.id)
      }
      this.$axios
        .$patch(`/api/collections/${this.collectionId}`, collectionUpdate)
        .then((collection) => {
          console.log('Collection updated', collection)
        })
        .catch((error) => {
          console.error('Failed to update collection', error)
          this.$toast.error('Failed to save collection books order')
        })
    },
    editBook(book) {
      var bookIds = this.books.map((b) => b.id)
      this.$store.commit('setBookshelfBookIds', bookIds)
      this.$store.commit('showEditModal', book)
    },
    init() {
      this.booksCopy = this.books.map((b) => ({ ...b }))
    }
  },
  mounted() {
    this.init()
  }
}
</script>

<style>
.collection-book-item {
  transition: all 0.4s ease;
}

.collection-book-enter-from,
.collection-book-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.collection-book-leave-active {
  position: absolute;
}
</style>