# WeChat Public Account Message Handler

一个用于处理微信公众号消息的 Node.js 服务器应用，支持文本消息和图片消息的处理，并将消息转发到 Blinko API。

## 功能特性

- 支持微信服务器的签名验证
- 处理文本消息
- 处理图片消息
- 支持图文组合消息（30秒内发送的图片和文字会自动关联）
- 消息自动转发到 Blinko API
- 完整的错误处理和日志记录

## 安装
bash
git clone [repository-url]
cd wechat-handler
npm install

## 配置

1. 复制配置文件模板：
```bash
cp config.example.js config.js
```

2. 修改 `config.js` 中的配置项：
- SERVER.PORT: 服务器端口
- SERVER.SESSION_SECRET: Session 密钥 随便填
- WECHAT.TOKEN: 微信公众平台配置的 Token 随便填 跟网页一致
- BLINKO.API_URL: Blinko API 地址
- BLINKO.API_TOKEN: Blinko API 访问令牌

## 运行

```bash
npm start
```


## API 端点

- GET `/wechat`: 处理微信服务器的验证请求
- POST `/wechat`: 处理微信服务器推送的消息

## 消息处理流程

1. 文本消息：
   - 直接转发到 Blinko API
   - 如果 30 秒内之前收到过图片，则与图片组合后转发

2. 图片消息：
   - 上传到 Blinko API
   - 等待 30 秒用户输入描述文字
   - 如果超时，则自动保存

## 错误处理

- 完整的错误捕获和处理机制
- 详细的错误日志记录
- 友好的错误响应

## 日志

日志文件位于 `logs` 目录：
- `access.log`: 访问日志
- `error.log`: 错误日志
- `app.log`: 应用日志

## 许可证

MIT
