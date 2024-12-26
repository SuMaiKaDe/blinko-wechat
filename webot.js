const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const session = require('express-session');
const config = require('./config');
const logger = require('./utils/logger');

// 初始化 Express 应用
const app = express();
const port = config.SERVER.PORT;

// 全局错误处理中间件
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack });
  res.status(500).send('Internal Server Error');
});

// 请求日志中间件
app.use((req, res, next) => {
  logger.info('Incoming request:', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
  });
  next();
});

// Session 配置
app.use(session({
  secret: config.SERVER.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 60000,
    secure: process.env.NODE_ENV === 'production',
  },
  store: new session.MemoryStore()
}));

// 配置常量
const WECHAT_TOKEN = config.WECHAT.TOKEN;
const BLINKO_API_URL = config.BLINKO.API_URL;
const BLINKO_API_TOKEN = config.BLINKO.API_TOKEN;

// 存储映射
const imageTimeouts = new Map();
const pendingImages = new Map();

// 处理 GET 请求（微信服务器验证）
app.get('/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;

  // 校验签名
  if (checkSignature(signature, timestamp, nonce)) {
    res.send(echostr); // 返回 echostr 以验证服务器地址有效性
  } else {
    res.status(403).send('Invalid Signature');
  }
});

// 处理 POST 请求（接收微信服务器推送的消息）
app.post('/wechat', express.text({ type: '*/*' }), async (req, res) => {
  const message = req.body;
  let parsedMessage;

  try {
    parsedMessage = parseWechatMessage(message);
    const { MsgType, Content, PicUrl, FromUserName, ToUserName } = parsedMessage;

    if (MsgType === 'text') {
      // 检查是否有未处理的图片
      const pendingImage = pendingImages.get(FromUserName);
      if (pendingImage) {
        // 如果有未处理的图片，将文字描述与图片关联
        const content = `${Content}`;
        const response = await sendToBlinko(content, [pendingImage]);

        if (response.data.id) {
          const reply = generateXmlResponse(ToUserName, FromUserName, '图文消息已保存');
          res.set('Content-Type', 'application/xml');
          res.send(reply);
        } else {
          const reply = generateXmlResponse(ToUserName, FromUserName, '保存失败');
          res.set('Content-Type', 'application/xml');
          res.send(reply);
        }

        // 清除定时器和待处理图片
        const timeoutId = imageTimeouts.get(FromUserName);
        if (timeoutId) {
          clearTimeout(timeoutId);
          imageTimeouts.delete(FromUserName);
        }
        pendingImages.delete(FromUserName);
      } else {
        // 如果没有未处理的图片，直接保存文本消息
        const response = await sendToBlinko(`${Content}`);
        if (response.data.id) {
          const reply = generateXmlResponse(ToUserName, FromUserName, '文本消息已保存');
          res.set('Content-Type', 'application/xml');
          res.send(reply);
        } else {
          const reply = generateXmlResponse(ToUserName, FromUserName, '保存失败');
          res.set('Content-Type', 'application/xml');
          res.send(reply);
        }
      }
    } else if (MsgType === 'image') {
      const imageResponse = await uploadImage(PicUrl);
      const { filePath: path, fileName: name, type, size } = imageResponse.data;
      const imageInfo = { path, name, type, size };
      
      // 存储图片信息到 Map
      pendingImages.set(FromUserName, imageInfo);

      // 设置定时器
      const timeoutId = setTimeout(async () => {
        // 检查是否还有未处理的图片
        if (pendingImages.has(FromUserName)) {
          const content = `来自微信公众号图片`;
          const response = await sendToBlinko(content, [imageInfo]);

          if (response.data.id) {
            console.log('图片已自动保存');
          } else {
            console.log('图片自动保存失败');
          }

          // 清理数据
          pendingImages.delete(FromUserName);
        }
        imageTimeouts.delete(FromUserName);
      }, config.UPLOAD.TIMEOUT);

      imageTimeouts.set(FromUserName, timeoutId);

      const reply = generateXmlResponse(ToUserName, FromUserName, '图片已接收，请输入文字描述（30秒后自动保存）');
      res.set('Content-Type', 'application/xml');
      res.send(reply);
    } else {
      const reply = generateXmlResponse(ToUserName, FromUserName, 'Unsupported message type');
      res.set('Content-Type', 'application/xml');
      res.status(400).send(reply);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    const errorResponse = generateErrorResponse(parsedMessage, '系统内部错误');
    res.set('Content-Type', 'application/xml');
    res.status(500).send(errorResponse);
  }
});

// 校验签名函数
function checkSignature(signature, timestamp, nonce) {
  // 将 token、timestamp、nonce 按字典序排序
  const tmpStr = [WECHAT_TOKEN, timestamp, nonce].sort().join('');

  // 进行 sha1 加密
  const sha1 = crypto.createHash('sha1');
  sha1.update(tmpStr);
  const tmpSignature = sha1.digest('hex');

  // 与 signature 对比
  return tmpSignature === signature;
}

// 解析微信消息
function parseWechatMessage(message) {
  const xml2js = require('xml2js');
  let result = {};

  xml2js.parseString(message, { explicitArray: false }, (err, res) => {
    if (!err) {
      result = res.xml;
    }
  });

  return result;
}

// 上传图片到 Blinko API
async function uploadImage(imageUrl) {
  const formData = new FormData();
  const response = await axios.get(imageUrl, { responseType: 'stream' });
  formData.append('file', response.data, { filename: 'image.jpg' });

  return axios.post(`${BLINKO_API_URL}/api/file/upload`, formData, {
    headers: {
      Authorization: `Bearer ${BLINKO_API_TOKEN}`,
      ...formData.getHeaders(),
    },
  });
}

// 送消息到 Blinko API
async function sendToBlinko(content, attachments = []) {
  const payload = {
    content,
    type: 0,
    attachments,
  };

  return axios.post(`${BLINKO_API_URL}/api/v1/note/upsert`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BLINKO_API_TOKEN}`,
    },
  });
}

// 生成 XML 格式的响应
function generateXmlResponse(fromUser,toUser, content) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `<xml>
    <ToUserName><![CDATA[${toUser}]]></ToUserName>
    <FromUserName><![CDATA[${fromUser}]]></FromUserName>
    <CreateTime>${timestamp}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>`;
}

// 添加一个新的错误响应生成函数
function generateErrorResponse(parsedMessage, errorMessage, errorDetails = {}) {
  logger.error('Generating error response:', {
    message: errorMessage,
    details: errorDetails,
    parsedMessage
  });

  if (parsedMessage?.FromUserName && parsedMessage?.ToUserName) {
    return generateXmlResponse(
      parsedMessage.ToUserName,
      parsedMessage.FromUserName,
      `错误：${errorMessage}`
    );
  }
  
  return `<xml>
    <Return>FAIL</Return>
    <Message><![CDATA[${errorMessage}]]></Message>
  </xml>`;
}

// 启动服务器
app.listen(port, () => {
  logger.info(`Server started on port ${port}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Closing server...');
  // 清理所有定时器
  for (const [userId, timeoutId] of imageTimeouts) {
    clearTimeout(timeoutId);
    logger.info(`Cleared timeout for user: ${userId}`);
  }
  process.exit(0);
});