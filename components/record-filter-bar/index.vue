<template>
  <view class="filter-bar">
    <view class="filter-bar__month" @click="openMonthPicker">
      <text class="filter-bar__label">记录月份</text>
      <text class="filter-bar__value">{{ selectedMonth || '请选择月份' }}</text>
    </view>
    <view
      v-if="selectedMonth"
      class="filter-bar__clear"
      @click.stop="clearMonth"
    >
      清空
    </view>
    <u-datetime-picker
      :show="monthPickerVisible"
      :value="pickerValue"
      mode="year-month"
      title="选择记录月份"
      confirm-color="#d27d56"
      @confirm="confirmMonth"
      @cancel="closeMonthPicker"
      @close="closeMonthPicker"
    />
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
      monthPickerVisible: false
    }
  },
  computed: {
    selectedMonth() {
      return this.value.startDate ? this.value.startDate.slice(0, 7) : ''
    },
    pickerValue() {
      const month = this.selectedMonth || this.getCurrentMonth()

      return new Date(`${month}-01`).getTime()
    }
  },
  methods: {
    openMonthPicker() {
      this.monthPickerVisible = true
    },
    closeMonthPicker() {
      this.monthPickerVisible = false
    },
    confirmMonth(event) {
      const date = new Date(event.value)
      const month = this.formatMonth(date)

      this.$emit('change', {
        shortcut: 'custom',
        startDate: `${month}-01`,
        endDate: this.getMonthEndDate(date)
      })
      this.closeMonthPicker()
    },
    clearMonth() {
      this.$emit('change', {
        shortcut: 'all',
        startDate: '',
        endDate: ''
      })
    },
    getCurrentMonth() {
      return this.formatMonth(new Date())
    },
    formatMonth(date) {
      const year = date.getFullYear()
      const month = `${date.getMonth() + 1}`.padStart(2, '0')

      return `${year}-${month}`
    },
    getMonthEndDate(date) {
      const year = date.getFullYear()
      const monthIndex = date.getMonth()
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()

      return `${this.formatMonth(date)}-${`${lastDay}`.padStart(2, '0')}`
    }
  }
}
</script>

<style lang="scss">
.filter-bar {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.filter-bar__month {
  flex: 1;
  min-height: 82rpx;
  padding: 12rpx 18rpx;
  border: 2rpx solid $cl-color-border;
  border-radius: 22rpx;
  background: #fffaf4;
  box-sizing: border-box;
}

.filter-bar__label {
  display: block;
  margin-bottom: 6rpx;
  font-size: 22rpx;
  color: $cl-color-subtext;
}

.filter-bar__value {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: $cl-color-text;
}

.filter-bar__clear {
  flex-shrink: 0;
  min-height: 82rpx;
  padding: 0 22rpx;
  border-radius: 22rpx;
  background: rgba(210, 125, 86, 0.12);
  color: $cl-color-primary;
  font-size: 26rpx;
  line-height: 82rpx;
}
</style>
