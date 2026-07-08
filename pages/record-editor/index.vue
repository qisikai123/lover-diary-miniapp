<template>
  <view class="page">
    <view class="page__card">
      <textarea
        v-model="form.content"
        class="page__textarea"
        maxlength="1000"
        placeholder="写下今天的生活日常"
      />

      <view class="page__toolbar">
        <u-button
          class="page__tool"
          shape="circle"
          plain
          :hair-line="false"
          @click="chooseImages"
        >
          选择图片
        </u-button>
        <u-button
          class="page__tool"
          shape="circle"
          plain
          :hair-line="false"
          @click="chooseVideo"
        >
          选择视频
        </u-button>
      </view>

      <record-media-grid
        :items="form.mediaList"
        :mode="form.recordType"
        removable
        @remove="removeMedia"
      />

      <view class="page__date-row">
        <text class="page__date-label">当前日期</text>
        <picker mode="date" :value="form.recordDate" @change="handleDateChange">
          <view class="page__date-value">{{
            form.recordDate || '请选择日期'
          }}</view>
        </picker>
      </view>
    </view>

    <u-button
      class="page__submit"
      type="primary"
      shape="circle"
      :hair-line="false"
      @click="saveRecord"
    >
      发布
    </u-button>
  </view>
</template>

<script>
import RecordMediaGrid from '@/components/record-media-grid/index.vue'
import {
  getRecordDetail,
  saveRecord as submitRecord,
} from '@/services/record/index'
import {
  createEmptyRecordDraft,
  inferRecordType,
  normalizeRecordDraft,
  validateRecordDraft,
} from '@/utils/record'
import { login } from '@/services/user/index'

function getToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default {
  components: {
    RecordMediaGrid,
  },
  data() {
    return {
      recordId: '',
      saving: false,
      currentUser: {
        nickname: '',
        avatarUrl: '',
        birthDate: '',
      },
      form: {
        ...createEmptyRecordDraft(),
        recordDate: getToday(),
      },
    }
  },
  onLoad(options) {
    this.recordId = options && options.id ? options.id : ''
    this.ensureCurrentUser()

    if (this.recordId) {
      this.loadRecordDetail()
    }
  },
  methods: {
    async ensureCurrentUser() {
      try {
        const response = await login(this.getStoredUserProfile())
        const user = response && response.data ? response.data.user : null

        if (user) {
          this.currentUser = {
            nickname: user.nickname || '微信用户',
            avatarUrl: user.avatarUrl || '',
            birthDate: user.birthDate || '',
          }
          uni.setStorageSync('currentUser', this.currentUser)
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '登录失败',
          icon: 'none',
        })
      }
    },
    getStoredUserProfile() {
      const user = uni.getStorageSync('currentUser') || {}

      return {
        nickname: user.nickname || user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        birthDate: user.birthDate || '',
      }
    },
    chooseImages() {
      if (this.form.recordType === 'video') {
        uni.showToast({
          title: '已选择视频时不能再上传图片',
          icon: 'none',
        })
        return
      }

      const remainingCount = 9 - this.form.mediaList.length

      if (remainingCount <= 0) {
        uni.showToast({
          title: '图片最多上传9张',
          icon: 'none',
        })
        return
      }

      uni.chooseImage({
        count: remainingCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: async (result) => {
          await this.uploadSelectedMedia(
            result.tempFilePaths.map((path) => ({
              path,
              mediaType: 'image',
            }))
          )
        },
      })
    },
    chooseVideo() {
      if (this.form.recordType === 'image') {
        uni.showToast({
          title: '已选择图片时不能再上传视频',
          icon: 'none',
        })
        return
      }

      if (this.form.recordType === 'video') {
        uni.showToast({
          title: '视频最多上传1个',
          icon: 'none',
        })
        return
      }

      uni.chooseVideo({
        sourceType: ['album', 'camera'],
        compressed: true,
        maxDuration: 60,
        success: async (result) => {
          await this.uploadSelectedMedia([
            {
              path: result.tempFilePath,
              mediaType: 'video',
              name: '视频',
            },
          ])
        },
      })
    },
    removeMedia(index) {
      const mediaList = this.form.mediaList.filter(
        (_, itemIndex) => itemIndex !== index
      )

      this.form = {
        ...this.form,
        mediaList,
        recordType: inferRecordType(mediaList),
      }
    },
    handleDateChange(event) {
      this.form = {
        ...this.form,
        recordDate: event.detail.value,
      }
    },
    async loadRecordDetail() {
      try {
        const response = await getRecordDetail({
          id: this.recordId,
        })
        const record = response && response.data ? response.data.record : null

        if (!record) {
          uni.showToast({
            title: '记录不存在',
            icon: 'none',
          })
          return
        }

        this.form = {
          ...createEmptyRecordDraft(),
          ...record,
          mediaList: Array.isArray(record.mediaList) ? record.mediaList : [],
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '记录加载失败',
          icon: 'none',
        })
      }
    },
    async uploadSelectedMedia(files) {
      if (!files.length) {
        return
      }

      if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.uploadFile) {
        uni.showToast({
          title: '当前环境不支持云存储上传',
          icon: 'none',
        })
        return
      }

      uni.showLoading({
        title: '上传中',
      })

      try {
        const uploadedMedia = []

        for (const file of files) {
          const cloudPath = this.buildCloudPath(file)
          const response = await wx.cloud.uploadFile({
            cloudPath,
            filePath: file.path,
          })

          uploadedMedia.push({
            mediaType: file.mediaType,
            url: response.fileID,
            name: file.name || cloudPath.split('/').pop(),
          })
        }

        const mediaList = this.form.mediaList.concat(uploadedMedia)

        this.form = {
          ...this.form,
          mediaList,
          recordType: inferRecordType(mediaList),
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '上传失败',
          icon: 'none',
        })
      } finally {
        uni.hideLoading()
      }
    },
    buildCloudPath(file) {
      const suffix =
        file.path && file.path.includes('.')
          ? file.path.split('.').pop()
          : 'tmp'
      const directory = file.mediaType === 'video' ? 'videos' : 'images'

      return `records/${directory}/${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}.${suffix}`
    },
    async saveRecord() {
      if (this.saving) {
        return
      }

      if (!this.currentUser.nickname) {
        await this.ensureCurrentUser()
      }

      const draft = normalizeRecordDraft({
        ...this.form,
        _id: this.recordId,
        authorName: this.currentUser.nickname || '微信用户',
      })
      const validation = validateRecordDraft(this.form)

      if (!validation.valid) {
        uni.showToast({
          title: validation.message,
          icon: 'none',
        })
        return
      }

      this.saving = true

      try {
        await submitRecord(draft)
        uni.showToast({
          title: '已保存',
          icon: 'success',
        })
        setTimeout(() => {
          uni.navigateBack()
        }, 500)
      } catch (error) {
        uni.showToast({
          title: error.message || '保存失败',
          icon: 'none',
        })
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx 24rpx 48rpx;
  box-sizing: border-box;
}

.page__card {
  padding: 28rpx;
  border: 2rpx solid $cl-color-border;
  border-radius: 28rpx;
  background: $cl-color-card;
}

.page__textarea {
  width: 100%;
  min-height: 280rpx;
  font-size: 30rpx;
  line-height: 1.7;
}

.page__toolbar {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
}

.page__tool {
  width: 100%;
  flex: 1;
  color: $cl-color-text;
}

.page__date-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 28rpx;
  padding-top: 28rpx;
  border-top: 2rpx solid rgba(236, 220, 207, 0.8);
}

.page__date-label {
  font-size: 28rpx;
  color: $cl-color-subtext;
}

.page__date-value {
  color: $cl-color-text;
  font-size: 28rpx;
  font-weight: 600;
}

.page__submit {
  margin-top: 32rpx;
  width: 100%;
}
</style>
