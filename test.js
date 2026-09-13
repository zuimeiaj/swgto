import * as pin from 'pinyin-pro'

const d = pin.pinyin('响应«List«客户端个体工商列表项»»', { toneType: 'none', type: 'array' }).join('')
console.log(d)
