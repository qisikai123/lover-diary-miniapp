<template>
  <view class="record-card">
    <view class="record-card__header">
      <view>
        <text class="record-card__author">{{
          record.authorName || '我们'
        }}</text>
      </view>
      <view class="record-card__toolbar">
        <text v-if="record.isTop" class="record-card__top-tag">置顶</text>
        <view class="record-card__menu">
          <view class="record-card__menu-trigger" @click="toggleActionMenu">
            <u-icon name="more-dot-fill" size="18" color="#7a675d" />
          </view>
          <view
            class="record-card__actions"
            :class="{ 'record-card__actions--visible': actionMenuVisible }"
          >
            <u-button
              class="record-card__action"
              shape="circle"
              plain
              :hair-line="false"
              @click="handleToggleTop"
            >
              {{ record.isTop ? '取消置顶' : '置顶' }}
            </u-button>
            <u-button
              v-if="canManageRecord"
              class="record-card__action"
              shape="circle"
              plain
              :hair-line="false"
              @click="handleEdit"
            >
              修改
            </u-button>
            <u-button
              v-if="canManageRecord"
              class="record-card__action"
              shape="circle"
              plain
              :hair-line="false"
              @click="handleRemove"
            >
              删除
            </u-button>
            <u-button
              class="record-card__action"
              shape="circle"
              plain
              :hair-line="false"
              @click="openCommentEditor"
            >
              评论
            </u-button>
          </view>
        </view>
      </view>
    </view>

    <text v-if="record.content" class="record-card__content">{{
      record.content
    }}</text>

    <record-media-grid
      v-if="record.mediaList && record.mediaList.length"
      :items="record.mediaList"
      :mode="record.recordType"
    />

    <text v-if="record.recordDate" class="record-card__date">{{
      record.recordDate
    }}</text>

    <view v-if="normalizedComments.length" class="record-card__comments">
      <view
        v-for="comment in normalizedComments"
        :key="comment.id"
        class="record-card__comment"
        @longpress="openCommentRemoveBubble(comment)"
        @click="closeCommentRemoveBubble"
      >
        <view
          v-if="activeCommentMenuId === comment.id"
          class="record-card__comment-bubble"
          @click.stop="handleRemoveComment(comment)"
        >
          <u-button
            class="record-card__comment-bubble-button"
            shape="circle"
            type="error"
            :hair-line="false"
          >
            删除
          </u-button>
        </view>
        <view class="record-card__comment-header">
          <text class="record-card__comment-author">{{
            comment.authorName
          }}</text>
          <text class="record-card__comment-time">{{
            formatCommentTime(comment.createdAt)
          }}</text>
        </view>
        <text class="record-card__comment-content">{{ comment.content }}</text>
      </view>
    </view>

    <view v-if="commentEditorVisible" class="record-card__comment-editor">
      <u-input
        v-model="commentDraft"
        maxlength="300"
        auto-height
        placeholder="写下你的评论"
      />
      <view class="record-card__comment-actions">
        <u-button
          class="record-card__comment-button"
          size="mini"
          shape="circle"
          plain
          :hair-line="false"
          @click="closeCommentEditor"
        >
          取消
        </u-button>
        <u-button
          class="record-card__comment-button"
          size="mini"
          type="primary"
          shape="circle"
          :hair-line="false"
          @click="confirmComment"
        >
          确定
        </u-button>
      </view>
    </view>
  </view>
</template>

<script>
import RecordMediaGrid from '@/components/record-media-grid/index.vue'

export default {
  components: {
    RecordMediaGrid,
  },
  props: {
    record: {
      type: Object,
      default: () => ({}),
    },
    currentUserOpenid: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      actionMenuVisible: false,
      activeCommentMenuId: '',
      commentDraft: '',
      commentEditorVisible: false,
    }
  },
  computed: {
    canManageRecord() {
      return Boolean(
        this.currentUserOpenid && this.record.openid === this.currentUserOpenid
      )
    },
    normalizedComments() {
      return Array.isArray(this.record.comments)
        ? this.record.comments.filter((comment) => comment && comment.id)
        : []
    },
  },
  methods: {
    toggleActionMenu() {
      this.actionMenuVisible = !this.actionMenuVisible
    },
    closeActionMenu() {
      this.actionMenuVisible = false
    },
    handleToggleTop() {
      this.closeActionMenu()
      this.$emit('toggle-top', this.record)
    },
    handleEdit() {
      this.closeActionMenu()
      this.$emit('edit', this.record)
    },
    handleRemove() {
      this.closeActionMenu()
      this.$emit('remove', this.record)
    },
    openCommentEditor() {
      this.closeActionMenu()
      this.commentEditorVisible = true
    },
    closeCommentEditor() {
      this.commentDraft = ''
      this.commentEditorVisible = false
    },
    confirmComment() {
      const content = this.commentDraft.trim()

      if (!content) {
        uni.showToast({
          title: '请输入评论内容',
          icon: 'none',
        })
        return
      }

      this.$emit('comment', {
        record: this.record,
        content,
      })
      this.closeCommentEditor()
    },
    canRemoveComment(comment) {
      return Boolean(
        this.currentUserOpenid && comment.openid === this.currentUserOpenid
      )
    },
    handleRemoveComment(comment) {
      this.activeCommentMenuId = ''
      uni.showModal({
        title: '删除评论',
        content: '删除后无法恢复，确定要删除这条评论吗？',
        confirmColor: '#d27d56',
        success: (result) => {
          if (!result.confirm) {
            return
          }

          this.$emit('remove-comment', {
            record: this.record,
            comment,
          })
        },
      })
    },
    openCommentRemoveBubble(comment) {
      this.closeCommentRemoveBubble()

      if (!this.canRemoveComment(comment)) {
        return
      }

      this.activeCommentMenuId = comment.id
    },
    closeCommentRemoveBubble() {
      this.activeCommentMenuId = ''
    },
    formatCommentTime(timestamp) {
      if (!timestamp) {
        return ''
      }

      const date = new Date(timestamp)

      if (Number.isNaN(date.getTime())) {
        return String(timestamp)
      }

      const year = date.getFullYear()
      const month = `${date.getMonth() + 1}`.padStart(2, '0')
      const day = `${date.getDate()}`.padStart(2, '0')
      const hour = `${date.getHours()}`.padStart(2, '0')
      const minute = `${date.getMinutes()}`.padStart(2, '0')

      return `${year}-${month}-${day} ${hour}:${minute}`
    },
  },
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
  gap: 20rpx;
}

.record-card__author {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: $cl-color-primary;
}

.record-card__date {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  color: $cl-color-subtext;
}

.record-card__toolbar {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.record-card__top-tag {
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  background: rgba(210, 125, 86, 0.12);
  color: $cl-color-primary;
}

.record-card__menu {
  position: relative;
}

.record-card__menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  width: 30rpx;
  height: 30rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.72);
}

.record-card__actions {
  position: absolute;
  top: 68rpx;
  right: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 228rpx;
  padding: 18rpx;
  border: 2rpx solid rgba(236, 220, 207, 0.8);
  border-radius: 24rpx;
  background: #fff;
  opacity: 0;
  transform: translateY(-12rpx) scale(0.96);
  transform-origin: top right;
  pointer-events: none;
  transition: opacity 180ms ease, transform 180ms ease;
  box-shadow: 0 18rpx 48rpx rgba(53, 38, 30, 0.14);
}

.record-card__actions--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.record-card__action {
  width: 100%;
  min-height: 68rpx;
  font-size: 30rpx;
  line-height: 68rpx;
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

.record-card__comments {
  margin-top: 22rpx;
  padding: 18rpx;
  border-radius: 22rpx;
  background: rgba(255, 255, 255, 0.58);
  padding-left: 25rpx;
}

.record-card__comment + .record-card__comment {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 2rpx solid rgba(236, 220, 207, 0.7);
}

.record-card__comment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.record-card__comment-author {
  font-size: 25rpx;
  font-weight: 700;
  color: $cl-color-text;
}

.record-card__comment-time {
  font-size: 22rpx;
  color: $cl-color-subtext;
}

.record-card__comment-content {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: $cl-color-text;
  white-space: pre-wrap;
}

.record-card__comment-editor {
  max-height: 0;
  margin-top: 0;
  opacity: 0;
  overflow: hidden;
  transform: translateY(-10rpx);
  transition: max-height 220ms ease, margin-top 220ms ease, opacity 180ms ease,
    transform 180ms ease;
}

.record-card__comment-editor--visible {
  max-height: 280rpx;
  margin-top: 22rpx;
  opacity: 1;
  transform: translateY(0);
}

.record-card__comment-input {
  width: 100%;
  min-height: 128rpx;
  padding: 20rpx;
  border: 2rpx solid $cl-color-border;
  border-radius: 22rpx;
  background: #fff;
  color: $cl-color-text;
  font-size: 26rpx;
  line-height: 1.5;
  box-sizing: border-box;
}

.record-card__comment-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18rpx;
  margin-top: 16rpx;
}

.record-card__comment-button {
  width: 100%;
}

.record-card__comment-editor {
  max-height: none;
  margin-top: 22rpx;
  opacity: 1;
  overflow: visible;
  transform: none;
  transition: none;
}

.record-card__comment-editor--visible {
  max-height: none;
  opacity: 1;
  overflow: visible;
  transform: none;
}
.record-card__comment {
  position: relative;
}

.record-card__comment-bubble {
  position: absolute;
  right: 0;
  bottom: 100%;
  z-index: 4;
  margin-bottom: 12rpx;
  padding: 10rpx;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: 0 14rpx 36rpx rgba(53, 38, 30, 0.16);
}

.record-card__comment-bubble::after {
  position: absolute;
  right: 34rpx;
  bottom: -10rpx;
  width: 20rpx;
  height: 20rpx;
  background: #fff;
  content: '';
  transform: rotate(45deg);
}

.record-card__comment-bubble-button {
  position: relative;
  z-index: 1;
}
</style>
