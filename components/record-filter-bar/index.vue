<template>
  <view class="filter-bar">
    <view
      class="filter-bar__trigger"
      hover-class="filter-bar__trigger--pressed"
      :hover-start-time="0"
      :hover-stay-time="120"
      @click="openMonthPicker"
      @longpress.stop="clearMonth"
    >
      <u-icon
        name="calendar"
        size="28"
        :color="selectedMonth ? '#d27d56' : '#7a675d'"
      />
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
      if (!this.selectedMonth) {
        return
      }

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
}

.filter-bar__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60rpx;
  height: 60rpx;
  border-radius: 50%;
  transition: background-color 120ms ease, transform 120ms ease;
}

.filter-bar__trigger--pressed {
  background: rgba(210, 125, 86, 0.14);
  transform: scale(0.88);
}
</style>
