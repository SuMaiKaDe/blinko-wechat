const winston = require('winston');
const path = require('path');

// 创建 logs 目录
const fs = require('fs');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// 创建 logger 实例
const logger = winston.createLogger({
  format: logFormat,
  transports: [
    // 错误日志
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
    }),
    // 应用日志
    new winston.transports.File({
      filename: path.join('logs', 'app.log'),
    }),
    // 访问日志
    new winston.transports.File({
      filename: path.join('logs', 'access.log'),
      level: 'info',
    }),
  ],
});

// 在开发环境下同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

module.exports = logger;