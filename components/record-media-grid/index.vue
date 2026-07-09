<template>
  <view v-if="items.length" class="media-grid">
    <view
      v-for="(item, index) in displayItems"
      :key="index"
      class="media-grid__item"
    >
      <image
        v-if="mode === 'image' && item.displayUrl"
        class="media-grid__image"
        :src="item.displayUrl"
        mode="aspectFill"
        @click="previewImage(index)"
      />
      <view v-else-if="mode === 'image'" class="media-grid__loading">
        图片加载中
      </view>
      <view v-else class="media-grid__video" @click="previewVideo(item)">
        <text class="media-grid__video-icon">▶</text>
        <text class="media-grid__video-label">{{ item.name || '视频' }}</text>
      </view>
      <view v-if="removable" class="media-grid__remove" @click.stop="$emit('remove', index)">×</view>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    items: {
      type: Array,
      default: () => []
    },
    mode: {
      type: String,
      default: 'text'
    },
    removable: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    displayItems() {
      return this.items.map((item) => ({
        ...item,
        displayUrl: item.displayUrl || (/^cloud:\/\//.test(item.url) ? '' : item.url)
      }))
    }
  },
  methods: {
    previewImage(index) {
      const urls = this.displayItems
        .map((item) => item.displayUrl)
        .filter(Boolean)

      if (!urls.length) {
        return
      }

      uni.previewImage({
        current: urls[index],
        urls
      })
    },
    previewVideo(item) {
      const url = item && item.displayUrl

      if (!url) {
        uni.showToast({
          title: '视频加载中，请稍后重试',
          icon: 'none'
        })
        return
      }

      if (typeof wx !== 'undefined' && wx.previewMedia) {
        wx.previewMedia({
          sources: [
            {
              url,
              type: 'video'
            }
          ]
        })
        return
      }

      uni.showToast({
        title: '当前环境暂不支持视频预览',
        icon: 'none'
      })
    }
  }
}
</script>

<style lang="scss">
.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  margin-top: 24rpx;
}

.media-grid__item {
  position: relative;
  height: 200rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: #f5ebe1;
}

.media-grid__image,
.media-grid__video,
.media-grid__loading {
  width: 100%;
  height: 100%;
}

.media-grid__video,
.media-grid__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $cl-color-text;
}

.media-grid__loading {
  font-size: 24rpx;
  color: #9b877c;
}

.media-grid__video-icon {
  font-size: 44rpx;
}

.media-grid__video-label {
  margin-top: 10rpx;
  font-size: 24rpx;
}

.media-grid__remove {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: rgba(47, 36, 31, 0.55);
  color: #fff;
  font-size: 28rpx;
  line-height: 40rpx;
  text-align: center;
}
</style>
