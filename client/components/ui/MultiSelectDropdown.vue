<template>
  <div class="w-full" v-click-outside="closeMenu">
    <p class="px-1 text-sm font-semibold">{{ label }}</p>
    <div ref="wrapper" class="relative">
      <div ref="inputWrapper" style="min-height: 40px" class="flex-wrap relative w-full shadow-sm flex items-center bg-primary border border-gray-600 rounded-md px-2 py-1 cursor-pointer" @click.stop.prevent="clickWrapper" @mouseup.stop.prevent @mousedown.prevent>
        <div v-for="item in selectedItems" :key="item.value" class="rounded-full px-2 py-1 ma-0.5 text-xs bg-bg flex flex-nowrap whitespace-nowrap items-center relative">
          <div class="w-full h-full rounded-full absolute top-0 left-0 opacity-0 hover:opacity-100 px-1 bg-bg bg-opacity-75 flex items-center justify-end cursor-pointer">
            <span class="material-icons text-white hover:text-error" style="font-size: 1.1rem" @click.stop="removeItem(item.value)">close</span>
          </div>
          {{ item.text }}
        </div>
      </div>

      <ul ref="menu" v-show="showMenu" class="absolute z-50 mt-1 w-full bg-bg border border-black-200 shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm" role="listbox" aria-labelledby="listbox-label">
        <template v-for="item in items">
          <li :key="item.value" class="text-gray-50 select-none relative py-2 pr-9 cursor-pointer hover:bg-black-400" role="option" @click="clickedOption($event, item)" @mouseup.stop.prevent @mousedown.prevent>
            <div class="flex items-center">
              <span class="font-normal ml-3 block truncate">{{ item.text }}</span>
            </div>
            <span v-if="selected.includes(item.value)" class="text-yellow-400 absolute inset-y-0 right-0 flex items-center pr-4">
              <span class="material-icons text-xl">checkmark</span>
            </span>
          </li>
        </template>
        <li v-if="!items.length" class="text-gray-50 select-none relative py-2 pr-9" role="option">
          <div class="flex items-center justify-center">
            <span class="font-normal">No items</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    value: {
      type: Array,
      default: () => []
    },
    items: {
      type: Array,
      default: () => []
    },
    label: String
  },
  data() {
    return {
      showMenu: false,
      menu: null
    }
  },
  computed: {
    selected: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    selectedItems() {
      return (this.value || []).map((v) => {
        return this.items.find((i) => i.value === v) || {}
      })
    }
  },
  methods: {
    recalcMenuPos() {
      if (!this.menu) return
      var boundingBox = this.$refs.inputWrapper.getBoundingClientRect()
      this.menu.style.top = boundingBox.y + boundingBox.height - 4 + 'px'
      this.menu.style.left = boundingBox.x + 'px'
      this.menu.style.width = boundingBox.width + 'px'
    },
    unmountMountMenu() {
      if (!this.$refs.menu) return
      this.menu = this.$refs.menu

      var boundingBox = this.$refs.inputWrapper.getBoundingClientRect()
      this.menu.remove()
      document.body.appendChild(this.menu)
      this.menu.style.top = boundingBox.y + boundingBox.height - 4 + 'px'
      this.menu.style.left = boundingBox.x + 'px'
      this.menu.style.width = boundingBox.width + 'px'
    },
    clickedOption(e, item) {
      if (e) {
        e.stopPropagation()
        e.preventDefault()
      }
      var newSelected = null
      if (this.selected.includes(item.value)) {
        newSelected = this.selected.filter((s) => s !== item.value)
      } else {
        newSelected = this.selected.concat([item.value])
      }
      this.$emit('input', newSelected)
      this.$nextTick(() => {
        this.recalcMenuPos()
      })
    },
    closeMenu() {
      this.showMenu = false
    },
    clickWrapper() {
      this.showMenu = !this.showMenu
    },
    removeItem(itemValue) {
      var remaining = this.selected.filter((i) => i !== itemValue)
      this.$emit('input', remaining)
      this.$nextTick(() => {
        this.recalcMenuPos()
      })
    }
  },
  mounted() {}
}
</script>