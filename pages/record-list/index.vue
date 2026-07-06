<template>
  <view class="page">
    <space-header :space="spaceProfile" />
    <record-filter-bar :value="filters" @change="handleFilterChange" />

    <view v-if="records.length" class="page__list">
      <record-card
        v-for="item in records"
        :key="item._id"
        :record="item"
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
  </view>
</template>

<script>
import SpaceHeader from '@/components/space-header/index.vue'
import RecordCard from '@/components/record-card/index.vue'
import RecordFilterBar from '@/components/record-filter-bar/index.vue'
import {
  getRecordList,
  removeRecord,
  toggleRecordTop
} from '@/services/record/index'
import {
  buildRecordDateRange,
  sortRecords
} from '@/utils/record'

export default {
  components: {
    SpaceHeader,
    RecordCard,
    RecordFilterBar
  },
  data() {
    return {
      spaceProfile: {
        name: '我们的生活日常',
        totalRecords: 0,
        members: []
      },
      filters: {
        shortcut: 'all',
        startDate: '',
        endDate: ''
      },
      records: [],
      loading: false
    }
  },
  onShow() {
    this.loadRecords()
  },
  methods: {
    handleFilterChange(nextFilters) {
      this.filters = {
        ...this.filters,
        ...nextFilters
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

        this.records = sortRecords(records)
        this.spaceProfile = {
          ...this.spaceProfile,
          totalRecords: typeof data.total === 'number' ? data.total : records.length
        }
      } catch (error) {
        uni.showToast({
          title: error.message || '记录加载失败',
          icon: 'none'
        })
      } finally {
        this.loading = false
      }
    },
    goCreate() {
      uni.navigateTo({
        url: '/pages/record-editor/index'
      })
    },
    goEdit(record) {
      uni.navigateTo({
        url: `/pages/record-editor/index?id=${record._id}`
      })
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
              id: record._id
            })
            await this.loadRecords()
            uni.showToast({
              title: '已删除',
              icon: 'success'
            })
          } catch (error) {
            uni.showToast({
              title: error.message || '删除失败',
              icon: 'none'
            })
          }
        }
      })
    },
    async handleToggleTop(record) {
      try {
        await toggleRecordTop({
          id: record._id,
          isTop: !record.isTop
        })
        await this.loadRecords()
      } catch (error) {
        uni.showToast({
          title: error.message || '操作失败',
          icon: 'none'
        })
      }
    }
  }
}
</script>

<style lang="scss">
.page {
  min-height: 100vh;
  padding: 32rpx 24rpx 120rpx;
  box-sizing: border-box;
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
  border-radius: 52rpx;
  background: linear-gradient(135deg, #d27d56, #e9a47f);
  color: #fff;
  font-size: 60rpx;
  line-height: 104rpx;
  text-align: center;
  box-shadow: 0 16rpx 40rpx rgba(210, 125, 86, 0.25);
}
</style>
