<template>
  <div class="page" :class="streamAudiobook ? 'streaming' : ''">
    <!-- <div class="flex h-full">
      <app-side-rail class="hidden md:block" />
      <div class="flex-grow">
        <app-book-shelf-toolbar is-home />
        <app-book-shelf-categorized />
      </div>
    </div> -->
  </div>
</template>

<script>
export default {
  asyncData({ redirect, store }) {
    redirect(`/library/${store.state.libraries.currentLibraryId}`)
  },
  data() {
    return {}
  },
  computed: {
    streamAudiobook() {
      return this.$store.state.streamAudiobook
    }
  },
  methods: {},
  mounted() {},
  beforeDestroy() {}
}
</script>
