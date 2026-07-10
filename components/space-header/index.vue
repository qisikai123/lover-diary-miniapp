<template>
  <view class="space-header">
    <view class="space-header__content">
      <view class="space-header__title-row">
        <text class="space-header__title">{{ space.name || '我们的空间' }}</text>
        <view class="space-header__action">
          <slot name="action">
            <view class="space-header__avatars">
              <view
                v-for="(member, index) in visibleMembers"
                :key="index"
                class="space-header__avatar"
              >
                <image
                  v-if="member.avatarUrl"
                  :src="member.avatarUrl"
                  mode="aspectFill"
                />
                <text v-else>{{
                  member.nickname ? member.nickname.slice(0, 1) : '爱'
                }}</text>
              </view>
            </view>
          </slot>
        </view>
      </view>
      <text class="space-header__meta">已记录 {{ space.totalRecords || 0 }} 条生活片段</text>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    space: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    visibleMembers() {
      return Array.isArray(this.space.members) ? this.space.members.slice(0, 2) : []
    }
  }
}
</script>

<style lang="scss">
.space-header {
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
  border-radius: 28rpx;
  background: linear-gradient(135deg, #fff7ef, #fffdf9);
  box-shadow: 0 18rpx 40rpx rgba(142, 100, 74, 0.08);
}

.space-header__content {
  min-width: 0;
}

.space-header__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
}

.space-header__title {
  display: block;
  min-width: 0;
  font-size: 40rpx;
  font-weight: 700;
  color: $cl-color-text;
}

.space-header__action {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

.space-header__meta {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: $cl-color-subtext;
}

.space-header__avatars {
  display: flex;
}

.space-header__avatar {
  width: 60rpx;
  height: 60rpx;
  margin-left: -10rpx;
  border: 4rpx solid #fff;
  border-radius: 50%;
  background: #f0d8c7;
  color: $cl-color-text;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 52rpx;
  text-align: center;
  overflow: hidden;
}

.space-header__avatar image {
  width: 100%;
  height: 100%;
}
</style>
