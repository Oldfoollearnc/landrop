'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeStorage } = require('electron');

const PREFIX = 'enc:v1:';
const AAD = Buffer.from('LanDrop:v1');

/**
 * 聊天记录的密钥管理。
 * 数据密钥（DEK）随机生成，用 Windows DPAPI（safeStorage）绑定当前账户封装后落盘。
 * 换账户/换电脑/删掉 key 文件都会解不开——这是预期行为，不是 bug。
 */
class Vault {
  constructor(dir) {
    this.file = path.join(dir, 'messages.key');
    this.key = null;
    this.enabled = false;
  }

  init() {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn('[vault] safeStorage 不可用，聊天记录保持明文');
        return this;
      }
      if (fs.existsSync(this.file)) {
        const wrapped = Buffer.from(fs.readFileSync(this.file, 'utf8'), 'base64');
        const raw = safeStorage.decryptString(wrapped);
        this.key = Buffer.from(raw, 'base64');
      } else {
        this.key = crypto.randomBytes(32);
        const wrapped = safeStorage.encryptString(this.key.toString('base64'));
        const tmp = `${this.file}.tmp`;
        fs.writeFileSync(tmp, wrapped.toString('base64'));
        fs.renameSync(tmp, this.file);
      }
      this.enabled = Buffer.isBuffer(this.key) && this.key.length === 32;
    } catch (err) {
      console.error('[vault] 初始化失败，保持明文:', err.message);
      this.key = null;
      this.enabled = false;
    }
    return this;
  }

  encrypt(text) {
    if (!this.enabled) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(AAD);
    const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }

  decrypt(line) {
    if (!line.startsWith(PREFIX)) return line;
    if (!this.enabled) throw new Error('vault locked');
    const raw = Buffer.from(line.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }
}

module.exports = { Vault, PREFIX };
