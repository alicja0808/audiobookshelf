<template>
  <div class="w-full h-full">
    <div v-if="allFolders.length" class="w-full bg-primary bg-opacity-70 py-1 px-4 mb-2">
      <p class="font-mono truncate">{{ selectedPath || '\\' }}</p>
    </div>
    <div v-if="allFolders.length" class="flex bg-primary bg-opacity-50 p-4">
      <div class="w-1/2 border-r border-bg">
        <div v-if="level > 0" class="w-full p-1 cursor-pointer flex items-center" @click="goBack">
          <span class="material-icons bg-opacity-50 text-yellow-200" style="font-size: 1.2rem">folder</span>
          <p class="text-base font-mono px-2">..</p>
        </div>
        <div v-for="dir in _directories" :key="dir.path" class="dir-item w-full p-1 cursor-pointer flex items-center hover:text-white text-gray-200" :class="dir.className" @click="selectDir(dir)">
          <span class="material-icons bg-opacity-50 text-yellow-200" style="font-size: 1.2rem">folder</span>
          <p class="text-base font-mono px-2 truncate">{{ dir.dirname }}</p>
          <span v-if="dir.dirs && dir.dirs.length && dir.path === selectedPath" class="material-icons" style="font-size: 1.1rem">arrow_right</span>
        </div>
      </div>
      <div class="w-1/2">
        <div v-for="dir in _subdirs" :key="dir.path" :class="dir.className" class="dir-item w-full p-1 cursor-pointer flex items-center hover:text-white text-gray-200" @click="selectSubDir(dir)">
          <span class="material-icons bg-opacity-50 text-yellow-200" style="font-size: 1.2rem">folder</span>
          <p class="text-base font-mono px-2 truncate">{{ dir.dirname }}</p>
        </div>
      </div>
    </div>
    <div v-else-if="loadingFolders" class="py-12 text-center">
      <p>Loading folders...</p>
    </div>
    <div v-else class="py-12 text-center">
      <p class="text-lg mb-2">No Folders Available</p>
      <p class="text-gray-300">Note: folders already mapped will not be shown</p>
    </div>

    <div class="absolute bottom-0 left-0 w-full py-4 px-8">
      <ui-btn :disabled="!selectedPath" color="primary" class="w-full mt-2" @click="selectFolder">Select Folder Path</ui-btn>
      <!-- <div class="flex items-center">
        <div class="flex-grow" />
        <ui-btn color="success" @click="selectFolder">Select</ui-btn>
      </div> -->
    </div>
  </div>
</template>

<script>
export default {
  props: {
    paths: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      loadingFolders: false,
      allFolders: [],
      directories: [],
      selectedPath: '',
      selectedFullPath: '',
      subdirs: [],
      level: 0,
      currentDir: null,
      previousDir: null
    }
  },
  computed: {
    _directories() {
      return this.directories.map((d) => {
        console.log('Directories', d)
        var isUsed = !!this.paths.find((path) => path.endsWith(d.path))
        var isSelected = d.path === this.selectedPath
        var classes = []
        if (isSelected) classes.push('dir-selected')
        if (isUsed) classes.push('dir-used')
        return {
          isUsed,
          isSelected,
          className: classes.join(' '),
          ...d
        }
      })
    },
    _subdirs() {
      return this.subdirs.map((d) => {
        var isUsed = !!this.paths.find((path) => path.endsWith(d.path))
        var classes = []
        if (isUsed) classes.push('dir-used')
        return {
          isUsed,
          className: classes.join(' '),
          ...d
        }
      })
    }
  },
  methods: {
    goBack() {
      var splitPaths = this.selectedPath.split('\\').slice(1)
      var prev = splitPaths.slice(0, -1).join('\\')

      var currDirs = this.allFolders
      for (let i = 0; i < splitPaths.length; i++) {
        var _dir = currDirs.find((dir) => dir.dirname === splitPaths[i])
        if (_dir && _dir.path.slice(1) === prev) {
          this.directories = currDirs
          this.selectDir(_dir)
          return
        } else if (_dir) {
          currDirs = _dir.dirs
        }
      }
    },
    selectDir(dir) {
      if (dir.isUsed) return
      this.selectedPath = dir.path
      this.selectedFullPath = dir.fullPath
      this.level = dir.level
      this.subdirs = dir.dirs
    },
    selectSubDir(dir) {
      if (dir.isUsed) return
      this.selectedPath = dir.path
      this.selectedFullPath = dir.fullPath
      this.level = dir.level
      this.directories = this.subdirs
      this.subdirs = dir.dirs
    },
    selectFolder() {
      if (!this.selectedPath) {
        console.error('No Selected path')
        return
      }
      if (this.paths.find((p) => p.startsWith(this.selectedFullPath))) {
        this.$toast.error(`Oops, you cannot add a parent directory of a folder already added`)
        return
      }
      this.$emit('select', this.selectedFullPath)
      this.selectedPath = ''
      this.selectedFullPath = ''
    },
    async init() {
      this.loadingFolders = true
      this.allFolders = await this.$store.dispatch('libraries/loadFolders')
      this.loadingFolders = false

      this.directories = this.allFolders
      this.subdirs = []
      this.selectedPath = ''
      this.selectedFullPath = ''
    }
  },
  mounted() {
    this.init()
  }
}
</script>



<style>
.dir-item.dir-selected {
  background-color: rgba(255, 255, 255, 0.1);
}
.dir-item.dir-used {
  background-color: rgba(255, 25, 0, 0.1);
}
</style>