<template>
  <view class="filter-bar">
    <view
      v-for="item in shortcuts"
      :key="item.value"
      :class="['filter-bar__chip', value.shortcut === item.value ? 'filter-bar__chip--active' : '']"
      @click="handleShortcutChange(item.value)"
    >
      {{ item.label }}
    </view>
  </view>
</template>

<script>
export default {
  props: {
    value: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      shortcuts: [
        { label: '全部', value: 'all' },
        { label: '本月', value: 'month' },
        { label: '最近3个月', value: 'quarter' }
      ]
    }
  },
  methods: {
    handleShortcutChange(shortcut) {
      this.$emit('change', {
        shortcut
      })
    }
  }
}
</script>

<style lang="scss">
.filter-bar {
  display: flex;
  gap: 16rpx;
  margin-bottom: 24rpx;
  overflow-x: auto;
}

.filter-bar__chip {
  flex-shrink: 0;
  padding: 14rpx 26rpx;
  border: 2rpx solid $cl-color-border;
  border-radius: 999rpx;
  background: #fffaf4;
  color: $cl-color-subtext;
  font-size: 26rpx;
}

.filter-bar__chip--active {
  border-color: transparent;
  background: linear-gradient(135deg, #d27d56, #e9a47f);
  color: #fff;
}
</style>
