const crypto = require('crypto');

function publicId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
}

module.exports = { publicId };
