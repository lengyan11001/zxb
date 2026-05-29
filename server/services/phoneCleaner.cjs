const VALID_PREFIXES = new Set([
  '130','131','132','133','134','135','136','137','138','139',
  '145','146','147','148','149',
  '150','151','152','153','155','156','157','158','159',
  '165','166','167',
  '170','171','172','173','174','175','176','177','178',
  '180','181','182','183','184','185','186','187','188','189',
  '190','191','192','193','195','196','197','198','199',
]);

function cleanPhone(input) {
  if (!input || typeof input !== 'string') {
    return { cleaned: '', display: '', status: 'invalid', reason: '空号码' };
  }

  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('86') && digits.length === 13) digits = digits.slice(2);

  if (digits.length !== 11 || !digits.startsWith('1')) {
    return { cleaned: digits, display: digits, status: 'invalid', reason: '非中国大陆手机号' };
  }

  const prefix = digits.slice(0, 3);
  if (!VALID_PREFIXES.has(prefix)) {
    return { cleaned: digits, display: mask(digits), status: 'pending', reason: '未知号段，待核验' };
  }

  return { cleaned: digits, display: mask(digits), status: 'cleaned', reason: '格式有效' };
}

function mask(phone) {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

module.exports = { cleanPhone, mask };
