<script>
import { WECHAT_CLOUD_ENV_ID } from './config/cloud'

export default {
  onLaunch() {
    // 微信云开发只在微信小程序运行时存在，其他端保留页面预览能力。
    // eslint-disable-next-line no-undef
    if (typeof wx !== 'undefined' && wx.cloud) {
      // eslint-disable-next-line no-undef
      wx.cloud.init({
        env: WECHAT_CLOUD_ENV_ID,
        traceUser: true
      })
    }
  },
  onShow() {},
  onHide() {}
}
</script>

<style lang="scss">
@import 'uview-ui/index.scss';
@import '@/uni.scss';

page {
  background: #f6f2ea;
  color: #2f241f;
  font-family: 'PingFang SC', 'Helvetica Neue', sans-serif;
}
</style>
