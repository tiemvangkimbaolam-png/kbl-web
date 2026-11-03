'use strict';
const fault=(status,code,message)=>Object.assign(Error(message),{status,code});
function validate(value, schema, at = '$', depth = 0) {
  if (depth > 24 || !schema || typeof schema !== 'object') throw fault(422, 'BAD_SCHEMA', 'Schema không được hỗ trợ.');
  if (schema.enum && !schema.enum.some(v => JSON.stringify(v) === JSON.stringify(value))) throw fault(422, 'BAD_RESULT', at + ': giá trị ngoài enum.');
  const t = schema.type;
  if (t === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault(422, 'BAD_RESULT', at + ': cần object.');
    const props = schema.properties || {};
    for (const k of schema.required || []) if (!Object.hasOwn(value, k)) throw fault(422, 'BAD_RESULT', at + ': thiếu ' + k + '.');
    for (const [k, v] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(k)) throw fault(422, 'BAD_RESULT', 'Khóa JSON không hợp lệ.');
      if (!Object.hasOwn(props, k)) {
        if (schema.additionalProperties === false) throw fault(422, 'BAD_RESULT', at + ': thừa ' + k + '.');
        if (typeof schema.additionalProperties === 'object') validate(v, schema.additionalProperties, at + '.' + k, depth + 1);
      } else validate(v, props[k], at + '.' + k, depth + 1);
    }
  } else if (t === 'array') {
    if (!Array.isArray(value) || value.length > Math.min(100, schema.maxItems ?? 100) || value.length < (schema.minItems || 0)) throw fault(422, 'BAD_RESULT', at + ': mảng sai độ dài.');
    value.forEach((v, i) => validate(v, schema.items, at + '[' + i + ']', depth + 1));
  } else if (t === 'string') {
    if (typeof value !== 'string' || value.length > Math.min(16000, schema.maxLength ?? 16000) || value.length < (schema.minLength || 0)) throw fault(422, 'BAD_RESULT', at + ': chuỗi sai độ dài.');
  } else if (t === 'number' || t === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (t === 'integer' && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw fault(422, 'BAD_RESULT', at + ': số không hợp lệ.');
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') throw fault(422, 'BAD_RESULT', at + ': cần boolean.');
  } else if (t === 'null') {
    if (value !== null) throw fault(422, 'BAD_RESULT', at + ': cần null.');
  } else throw fault(422, 'BAD_SCHEMA', at + ': kiểu schema không được hỗ trợ.');
}

module.exports={validate};
