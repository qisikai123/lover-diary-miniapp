<template>
  <view class="record-card">
    <view class="record-card__header">
      <view>
        <text class="record-card__author">{{ record.authorName || '我们' }}</text>
        <text class="record-card__date">{{ record.recordDate || '' }}</text>
      </view>
      <view class="record-card__actions">
        <text v-if="record.isTop" class="record-card__top-tag">置顶</text>
        <view class="record-card__action" @click="$emit('toggle-top', record)">
          {{ record.isTop ? '取消置顶' : '置顶' }}
        </view>
        <view class="record-card__action" @click="$emit('edit', record)">编辑</view>
        <view class="record-card__action" @click="$emit('remove', record)">删除</view>
      </view>
    </view>

    <text v-if="record.content" class="record-card__content">{{ record.content }}</text>

    <record-media-grid
      v-if="record.mediaList && record.mediaList.length"
      :items="record.mediaList"
      :mode="record.recordType"
    />
  </view>
</template>

<script>
import RecordMediaGrid from '@/components/record-media-grid/index.vue'

export default {
  components: {
    RecordMediaGrid
  },
  props: {
    record: {
      type: Object,
      default: () => ({})
    }
  }
}
</script>

<style lang="scss">
.record-card {
  padding: 24rpx;
  border-radius: 28rpx;
  background: $cl-color-card;
  box-shadow: 0 14rpx 30rpx rgba(131, 95, 74, 0.08);
}

.record-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.record-card__author {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $cl-color-text;
}

.record-card__date {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $cl-color-subtext;
}

.record-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12rpx;
  margin-left: 24rpx;
}

.record-card__top-tag,
.record-card__action {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
}

.record-card__top-tag {
  background: rgba(210, 125, 86, 0.12);
  color: $cl-color-primary;
}

.record-card__action {
  border: 2rpx solid $cl-color-border;
  color: $cl-color-subtext;
}

.record-card__content {
  display: block;
  margin-top: 18rpx;
  font-size: 28rpx;
  line-height: 1.8;
  color: $cl-color-text;
  white-space: pre-wrap;
}
</style>
