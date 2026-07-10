<template>
  <view class="page">
    <view class="page__user-entry" @click="openUserProfile">
      <u-icon name="account" size="30" color="#d27d56" />
    </view>
    <view class="page__header">
      <space-header :space="spaceProfile">
        <record-filter-bar
          slot="action"
          :value="filters"
          @change="handleFilterChange"
        />
      </space-header>
    </view>

    <view v-if="records.length" class="page__list">
      <record-card
        v-for="item in records"
        :key="item._id"
        :record="item"
        :current-user-openid="currentUser.openid"
        @comment="handleCreateComment"
        @remove-comment="handleRemoveComment"
        @edit="goEdit"
        @remove="handleRemove"
        @toggle-top="handleToggleTop"
      />
    </view>

    <view v-else class="page__empty">
      <text class="page__empty-title">还没有生活记录</text>
      <text class="page__empty-subtitle">发布第一条记录吧</text>
    </view>

    <view class="page__fab" @click="goCreate">+</view>

    <view v-if="profileVisible" class="profile-modal">
      <view class="profile-modal__mask" @click="closeUserProfile"></view>
      <view class="profile-modal__panel">
        <text class="profile-modal__title">用户信息</text>

        <view class="profile-modal__field">
          <text class="profile-modal__label">用户姓名</text>
          <input
            v-model="profileForm.nickname"
            class="profile-modal__input"
            type="nickname"
            placeholder="请输入用户姓名"
            @blur="handleNicknameBlur"
          />
        </view>

        <view class="profile-modal__field">
          <text class="profile-modal__label">出生日期</text>
          <picker
            mode="date"
            :value="profileForm.birthDate"
            @change="handleBirthDateChange"
          >
            <view class="profile-modal__date">
              {{ profileForm.birthDate || '请选择出生日期' }}
            </view>
          </picker>
        </view>

        <view class="profile-modal__actions">
          <u-button
            class="profile-modal__button"
            shape="circle"
            plain
            :hair-line="false"
            @click="closeUserProfile"
          >
            取消
          </u-button>
          <u-button
            class="profile-modal__button"
            type="primary"
            shape="circle"
            :hair-line="false"
            @click="saveUserProfile"
          >
            保存
          </u-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import SpaceHeader from '@/components/space-header/index.vue'
import RecordCard from '@/components/record-card/index.vue'
import RecordFilterBar from '@/components/record-filter-bar/index.vue'
import {
  createRecordComment,
  getMediaDisplayUrls,
  getRecordList,
  removeRecordComment,
  removeRecord,
  toggleRecordTop,
} from '@/services/record/index'
import { resolveRecordsMediaDisplayUrls } from '@/utils/cloud-media'
import { buildRecordDateRange, sortRecords } from '@/utils/record'
import { login, updateUserProfile } from '@/services/user/index'

export default {
  components: {
    SpaceHeader,
    RecordCard,
    RecordFilterBar,
  },
  data() {
    return {
      spaceProfile: {
        name: '我们的生活日常',
        totalRecords: 0,
        members: [],
      },
      currentUser: {
        openid: '',
        nickname: '',
        avatarUrl: '',
        birthDate: '',
      },
      profileVisible: false,
      profileForm: {
        nickname: '',
        avatarUrl: '',
        birthDate: '',
      },
      filters: {
        shortcut: 'all',
        startDate: '',
        endDate: '',
      },
      records: [],
      loading: false,
    }
  },
  onShow() {
    this.ensureCurrentUser()
    this.loadRecords()
  },
  methods: {
    async ensureCurrentUser() {
      try {
        const response = await login(this.getWechatProfile())
        const user = response && response.data ? response.data.user : null

        if (user) {
          this.setCurrentUser(user)
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '登录失败',
          icon: 'none',
        })
      }
    },
    getWechatProfile() {
      const storedUser = uni.getStorageSync('currentUser') || {}

      return {
        nickname: storedUser.nickname || storedUser.nickName || '',
        avatarUrl: storedUser.avatarUrl || '',
        birthDate: storedUser.birthDate || '',
      }
    },
    setCurrentUser(user) {
      const currentUser = {
        openid: user.openid || '',
        nickname: user.nickname || '微信用户',
        avatarUrl: user.avatarUrl || '',
        birthDate: user.birthDate || '',
      }

      this.currentUser = currentUser
      this.profileForm = {
        ...currentUser,
      }
      uni.setStorageSync('currentUser', currentUser)
    },
    openUserProfile() {
      this.profileForm = {
        ...this.currentUser,
      }
      this.profileVisible = true
    },
    closeUserProfile() {
      this.profileVisible = false
    },
    handleNicknameBlur(event) {
      const nickname =
        event.detail && event.detail.value ? event.detail.value.trim() : ''

      if (nickname) {
        this.profileForm = {
          ...this.profileForm,
          nickname,
        }
      }
    },
    handleBirthDateChange(event) {
      this.profileForm = {
        ...this.profileForm,
        birthDate: event.detail.value,
      }
    },
    async saveUserProfile() {
      const nickname = this.profileForm.nickname.trim()

      if (!nickname) {
        uni.showToast({
          title: '请输入用户姓名',
          icon: 'none',
        })
        return
      }

      try {
        const response = await updateUserProfile({
          ...this.profileForm,
          nickname,
        })
        const user = response && response.data ? response.data.user : null

        if (user) {
          this.setCurrentUser(user)
        }

        this.profileVisible = false
        uni.showToast({
          title: '已保存',
          icon: 'success',
        })
      } catch (error) {
        uni.showToast({
          title: error.message || '保存失败',
          icon: 'none',
        })
      }
    },
    handleFilterChange(nextFilters) {
      this.filters = {
        ...this.filters,
        ...nextFilters,
      }
      this.loadRecords()
    },
    async loadRecords() {
      if (this.loading) {
        return
      }

      this.loading = true

      try {
        const dateRange = buildRecordDateRange(this.filters)
        const response = await getRecordList(dateRange)
        const data = response && response.data ? response.data : {}
        const records = Array.isArray(data.list) ? data.list : []
        const recordsWithMedia = await resolveRecordsMediaDisplayUrls(
          records,
          getMediaDisplayUrls
        )

        this.records = sortRecords(recordsWithMedia)
        this.spaceProfile = {
          ...this.spaceProfile,
          totalRecords:
            typeof data.total === 'number' ? data.total : records.length,
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '记录加载失败',
          icon: 'none',
        })
      } finally {
        this.loading = false
      }
    },
    goCreate() {
      uni.navigateTo({
        url: '/pages/record-editor/index',
      })
    },
    goEdit(record) {
      uni.navigateTo({
        url: `/pages/record-editor/index?id=${record._id}`,
      })
    },
    async handleCreateComment({ record, content }) {
      try {
        await createRecordComment({
          recordId: record._id,
          content,
        })
        await this.loadRecords()
        uni.showToast({
          title: '已评论',
          icon: 'success',
        })
      } catch (error) {
        uni.showToast({
          title: error.message || '评论失败',
          icon: 'none',
        })
      }
    },
    async handleRemoveComment({ record, comment }) {
      try {
        await removeRecordComment({
          recordId: record._id,
          commentId: comment.id,
        })
        await this.loadRecords()
        uni.showToast({
          title: '已删除',
          icon: 'success',
        })
      } catch (error) {
        uni.showToast({
          title: error.message || '删除评论失败',
          icon: 'none',
        })
      }
    },
    handleRemove(record) {
      uni.showModal({
        title: '删除记录',
        content: '删除后无法恢复，确定要删除吗？',
        confirmColor: '#d27d56',
        success: async (result) => {
          if (!result.confirm) {
            return
          }

          try {
            await removeRecord({
              id: record._id,
            })
            await this.loadRecords()
            uni.showToast({
              title: '已删除',
              icon: 'success',
            })
          } catch (error) {
            uni.showToast({
              title: error.message || '删除失败',
              icon: 'none',
            })
          }
        },
      })
    },
    async handleToggleTop(record) {
      try {
        await toggleRecordTop({
          id: record._id,
          isTop: !record.isTop,
        })
        await this.loadRecords()
      } catch (error) {
        uni.showToast({
          title: error.message || '操作失败',
          icon: 'none',
        })
      }
    },
  },
}
</script>

<style lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx 24rpx 120rpx;
  box-sizing: border-box;
}

.page__user-entry {
  margin-bottom: 16rpx;
  color: $cl-color-primary;
  display: flex;
  justify-content: flex-end;
}

.page__list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.page__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 180rpx 0;
  color: $cl-color-subtext;
}

.page__empty-title {
  font-size: 34rpx;
  font-weight: 600;
}

.page__empty-subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
}

.page__fab {
  position: fixed;
  right: 32rpx;
  bottom: 48rpx;
  width: 104rpx;
  height: 104rpx;
  font-size: 60rpx;
  background-color: $cl-color-primary;
  color: #fff;
  border-radius: 50%;
  display: flex;
  justify-content: center;
}

.profile-modal {
  position: fixed;
  inset: 0;
  z-index: 20;
}

.profile-modal__mask {
  position: absolute;
  inset: 0;
  background: rgba(53, 38, 30, 0.35);
}

.profile-modal__panel {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  top: 50%;
  padding: 32rpx;
  border-radius: 32rpx;
  background: #fff;
  transform: translateY(-50%);
  box-shadow: 0 28rpx 80rpx rgba(53, 38, 30, 0.18);
}

.profile-modal__title {
  display: block;
  margin-bottom: 28rpx;
  color: $cl-color-text;
  font-size: 34rpx;
  font-weight: 700;
}

.profile-modal__field {
  margin-top: 24rpx;
}

.profile-modal__label {
  display: block;
  margin-bottom: 12rpx;
  color: $cl-color-subtext;
  font-size: 26rpx;
}

.profile-modal__input,
.profile-modal__date {
  min-height: 76rpx;
  padding: 0 24rpx;
  border: 2rpx solid $cl-color-border;
  border-radius: 20rpx;
  background: #fffaf6;
  color: $cl-color-text;
  font-size: 28rpx;
  line-height: 76rpx;
  box-sizing: border-box;
}

.profile-modal__actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20rpx;
  margin-top: 36rpx;
}

.profile-modal__button {
  width: 100%;
}
</style>
