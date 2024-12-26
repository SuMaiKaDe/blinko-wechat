module.exports = {
  // 服务器配置
  SERVER: {
      PORT: 9006, //替换为你喜欢的端口号
      SESSION_SECRET: 'abcaaa' // 替换为你的密钥,任意字符
  },

  // 微信配置
  WECHAT: {
      TOKEN: 'ABc12457'//公众平台配置的 Token
  },
  // Blinko API 配置
  BLINKO: {
      API_URL: 'https://blin.baidu.abc:10/',
      API_TOKEN: ''  // 替换为实际的 Blinko API Token
  },
  // 图片上传配置
  UPLOAD: {
      TIMEOUT: 30000  // 图片描述等待超时时间（毫秒）
  }
}; 