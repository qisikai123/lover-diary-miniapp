<template>
  <view class="page">
    <view v-if="accessDenied" class="page__access-denied">
      <text class="page__access-title">无权限</text>
      <text class="page__access-subtitle">当前账号无权限进入</text>
    </view>

    <view v-else class="page__card">
      <textarea
        v-model="form.content"
        class="page__textarea"
        :disabled="Boolean(pendingReviewId)"
        maxlength="1000"
        placeholder="写下今天的生活日常"
      />

      <view class="page__toolbar">
        <u-button
          class="page__tool"
          shape="circle"
          plain
          :hair-line="false"
          :disabled="Boolean(pendingReviewId) || reviewingMedia"
          @click="chooseImages"
        >
          选择图片
        </u-button>
        <u-button
          class="page__tool"
          shape="circle"
          plain
          :hair-line="false"
          :disabled="Boolean(pendingReviewId) || reviewingMedia"
          @click="chooseVideo"
        >
          选择视频
        </u-button>
      </view>

      <record-media-grid
        :items="form.mediaList"
        :mode="form.recordType"
        :removable="!pendingReviewId"
        @remove="removeMedia"
      />

      <view class="page__date-row">
        <text class="page__date-label">当前日期</text>
        <picker
          mode="date"
          :value="form.recordDate"
          :disabled="Boolean(pendingReviewId)"
          @change="handleDateChange"
        >
          <view class="page__date-value">{{
            form.recordDate || '请选择日期'
          }}</view>
        </picker>
      </view>
    </view>

    <u-button
      v-if="!accessDenied"
      class="page__submit"
      type="primary"
      shape="circle"
      :hair-line="false"
      :disabled="reviewingMedia"
      :loading="saving || reviewingMedia"
      @click="saveRecord"
    >
      {{
        reviewingMedia
          ? '图片审核中'
          : pendingReviewId
            ? '查询审核结果'
            : '发布'
      }}
    </u-button>
  </view>
</template>

<script>
import RecordMediaGrid from '@/components/record-media-grid/index.vue'
import {
  createMediaReview,
  getContentSecurityReview,
  getMediaDisplayUrls,
  getRecordDetail,
  saveRecord as submitRecord,
} from '@/services/record/index'
import {
  createEmptyRecordDraft,
  inferRecordType,
  normalizeRecordDraft,
  validateRecordDraft,
} from '@/utils/record'
import { resolveRecordMediaDisplayUrls } from '@/utils/cloud-media'
import { chooseRecordMedia } from '@/utils/media-picker'
import { reviewUploadedImage } from '@/utils/media-review'
import {
  isAccessDeniedError,
  showNoPermissionModal,
} from '@/utils/access-control'
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
      pendingReviewId: '',
      reviewingMedia: false,
      saving: false,
      accessDenied: false,
      accessDeniedModalVisible: false,
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
  async onLoad(options) {
    this.recordId = options && options.id ? options.id : ''
    const authenticated = await this.ensureCurrentUser()

    if (!authenticated) {
      return
    }

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
          this.accessDenied = false
          uni.setStorageSync('currentUser', this.currentUser)
          return true
        }
      } catch (error) {
        if (isAccessDeniedError(error)) {
          this.handleAccessDenied()
          return false
        }

        uni.showToast({
          title: error.message || '登录失败',
          icon: 'none',
        })
      }

      return false
    },
    handleAccessDenied() {
      this.accessDenied = true
      this.saving = false
      this.reviewingMedia = false
      this.pendingReviewId = ''
      this.currentUser = {
        nickname: '',
        avatarUrl: '',
        birthDate: '',
      }
      uni.removeStorageSync('currentUser')
      this.showAccessDeniedModal()
    },
    showAccessDeniedModal() {
      if (this.accessDeniedModalVisible) {
        return
      }

      this.accessDeniedModalVisible = true
      showNoPermissionModal(uni, {
        complete: () => {
          this.accessDeniedModalVisible = false
        },
      })
    },
    getStoredUserProfile() {
      const user = uni.getStorageSync('currentUser') || {}

      return {
        nickname: user.nickname || user.nickName || '',
        avatarUrl: user.avatarUrl || '',
        birthDate: user.birthDate || '',
      }
    },
    async chooseImages() {
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

      try {
        const files = await chooseRecordMedia({
          mediaType: 'image',
          count: remainingCount,
          uniApi: uni,
        })

        await this.uploadSelectedMedia(files)
      } catch (error) {
        this.showMediaChooseFailure(error)
      }
    },
    async chooseVideo() {
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

      try {
        const files = await chooseRecordMedia({
          mediaType: 'video',
          uniApi: uni,
        })

        await this.uploadSelectedMedia(files)
      } catch (error) {
        this.showMediaChooseFailure(error)
      }
    },
    showMediaChooseFailure(error) {
      uni.showToast({
        title: error.message || '媒体选择失败，请重试',
        icon: 'none',
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

        const recordWithMedia = await resolveRecordMediaDisplayUrls(
          record,
          getMediaDisplayUrls
        )

        this.form = {
          ...createEmptyRecordDraft(),
          ...recordWithMedia,
          mediaList: Array.isArray(recordWithMedia.mediaList)
            ? recordWithMedia.mediaList
            : [],
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

      this.reviewingMedia = true
      uni.showLoading({
        title: files.some((file) => file.mediaType === 'image')
          ? '图片审核中'
          : '上传中',
      })

      let results = []

      try {
        results = await Promise.all(
          files.map((file) => this.uploadReviewedMedia(file))
        )
      } finally {
        this.reviewingMedia = false
        uni.hideLoading()
      }

      this.showMediaReviewFeedback(results)
    },
    async uploadReviewedMedia(file) {
      try {
        const result = await this.uploadAndReviewMedia(file)

        this.appendApprovedMedia([result])
        return result
      } catch (error) {
        return {
          status: 'failed',
          media: null,
          error,
        }
      }
    },
    async uploadAndReviewMedia(file) {
      const media = await this.uploadMedia(file)

      if (file.mediaType !== 'image') {
        return {
          status: 'passed',
          media,
        }
      }

      return reviewUploadedImage({
        media,
        createReview: createMediaReview,
        getReview: getContentSecurityReview,
        delay: this.delay,
      })
    },
    async uploadMedia(file) {
      const cloudPath = this.buildCloudPath(file)
      const response = await wx.cloud.uploadFile({
        cloudPath,
        filePath: file.path,
      })

      return {
        mediaType: file.mediaType,
        url: response.fileID,
        displayUrl: await this.resolveUploadedMediaUrl(response.fileID),
        name: file.name || cloudPath.split('/').pop(),
      }
    },
    appendApprovedMedia(results) {
      const approvedMedia = results
        .filter((result) => result.status === 'passed' && result.media)
        .map((result) => result.media)

      if (!approvedMedia.length) {
        return
      }

      const mediaList = this.form.mediaList.concat(approvedMedia)

      this.form = {
        ...this.form,
        mediaList,
        recordType: inferRecordType(mediaList),
      }
    },
    showMediaReviewFeedback(results) {
      if (results.some((result) => result.status === 'rejected')) {
        uni.showToast({
          title: '所发布内容含违规信息',
          icon: 'none',
        })
        return
      }

      const failedResult = results.find((result) => result.status === 'failed')

      if (failedResult) {
        uni.showToast({
          title:
            (failedResult.error && failedResult.error.message) ||
            '内容安全检测失败，请稍后重试',
          icon: 'none',
        })
        return
      }

      if (results.some((result) => result.status === 'pending')) {
        uni.showToast({
          title: '图片仍在审核，请稍后重新上传',
          icon: 'none',
        })
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
    async resolveUploadedMediaUrl(fileID) {
      if (!fileID || !wx.cloud.getTempFileURL) {
        return ''
      }

      const response = await wx.cloud.getTempFileURL({
        fileList: [fileID],
      })
      const fileList = Array.isArray(response.fileList)
        ? response.fileList
        : []
      const file = fileList[0]

      return file && file.tempFileURL ? file.tempFileURL : ''
    },
    async saveRecord() {
      if (this.accessDenied) {
        this.showAccessDeniedModal()
        return
      }

      if (this.saving || this.reviewingMedia) {
        return
      }

      if (this.pendingReviewId) {
        await this.resumePendingReview()
        return
      }

      if (!this.currentUser.nickname) {
        await this.ensureCurrentUser()
      }

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
        const mediaReady = await this.ensureMediaReviewsReady()

        if (!mediaReady) {
          return
        }

        const draft = this.createSubmissionDraft()
        const response = await submitRecord(draft)

        await this.handleSaveResult(response)
      } catch (error) {
        uni.showToast({
          title: error.message || '保存失败',
          icon: 'none',
        })
      } finally {
        this.saving = false
      }
    },
    async ensureMediaReviewsReady() {
      const reviewIds = Array.from(
        new Set(
          this.form.mediaList
            .filter((item) => item.mediaType === 'image' && item.reviewId)
            .map((item) => item.reviewId)
        )
      )

      if (!reviewIds.length) {
        return true
      }

      const responses = await Promise.all(
        reviewIds.map((reviewId) =>
          getContentSecurityReview({
            reviewId,
          })
        )
      )
      const reviews = responses.map((response) =>
        response && response.data ? response.data : {}
      )

      if (reviews.some((review) => review.status === 'rejected')) {
        uni.showToast({
          title: '所发布内容含违规信息',
          icon: 'none',
        })
        return false
      }

      if (reviews.some((review) => review.status === 'failed')) {
        throw new Error('内容安全检测失败，请稍后重试')
      }

      if (reviews.some((review) => review.status !== 'passed')) {
        uni.showToast({
          title: '图片正在审核，请稍后发布',
          icon: 'none',
        })
        return false
      }

      return true
    },
    async resumePendingReview() {
      this.saving = true

      try {
        await this.waitForContentReview(this.pendingReviewId)
      } catch (error) {
        uni.showToast({
          title: error.message || '审核结果查询失败',
          icon: 'none',
        })
      } finally {
        this.saving = false
      }
    },
    createSubmissionDraft() {
      return normalizeRecordDraft({
        ...this.form,
        _id: this.recordId,
        authorName: this.currentUser.nickname || '微信用户',
      })
    },
    async handleSaveResult(response) {
      const data = response && response.data ? response.data : {}

      if (data.pendingReview && data.reviewId) {
        this.pendingReviewId = data.reviewId
        await this.waitForContentReview(data.reviewId)
        return
      }

      this.finishSave()
    },
    async waitForContentReview(reviewId) {
      let review = null

      uni.showLoading({
        title: '内容审核中',
      })

      try {
        review = await this.pollContentReview(reviewId)
      } finally {
        uni.hideLoading()
      }

      this.handleContentReviewResult(review)
    },
    async pollContentReview(reviewId) {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const response = await getContentSecurityReview({
          reviewId,
        })
        const review = response && response.data ? response.data : {}

        if (['passed', 'rejected', 'failed'].includes(review.status)) {
          return review
        }

        if (attempt < 14) {
          await this.delay(2000)
        }
      }

      return null
    },
    handleContentReviewResult(review) {
      if (!review) {
        uni.showToast({
          title: '内容仍在审核，请稍后继续查询',
          icon: 'none',
        })
        return
      }

      if (review.status === 'passed') {
        this.pendingReviewId = ''
        this.finishSave()
        return
      }

      if (review.status === 'rejected') {
        this.pendingReviewId = ''
        uni.showToast({
          title: '所发布内容含违规信息',
          icon: 'none',
        })
        return
      }

      this.pendingReviewId = ''
      throw new Error('内容安全检测失败，请稍后重试')
    },
    finishSave() {
      uni.showToast({
        title: '已保存',
        icon: 'success',
      })
      setTimeout(() => {
        uni.navigateBack()
      }, 500)
    },
    delay(duration) {
      return new Promise((resolve) => {
        setTimeout(resolve, duration)
      })
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

.page__access-denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 180rpx 0;
  color: $cl-color-subtext;
}

.page__access-title {
  font-size: 34rpx;
  font-weight: 600;
}

.page__access-subtitle {
  margin-top: 16rpx;
  font-size: 26rpx;
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
