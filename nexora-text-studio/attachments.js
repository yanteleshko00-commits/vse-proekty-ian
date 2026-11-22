import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export const MAX_ATTACHMENTS = 3;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 7 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_MIMES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.txt', 'text/plain']
]);

function fail(message, code = 400) {
  const error = new Error(message);
  error.statusCode = code;
  throw error;
}
function fileExt(name) {
  const found = String(name).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return found?.[1] || '';
}
function parseDataUrl(data) {
  if (typeof data !== 'string' || data.length > (MAX_DOCUMENT_BYTES * 4 / 3 + 1024)) fail('Файл слишком большой.');
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2].length % 4) fail('Некорректные данные файла.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.toString('base64').replace(/=+$/, '') !== match[2].replace(/=+$/, '')) fail('Некорректная кодировка файла.');
  return { mime: match[1], buffer };
}
function matchesSignature(mime, buf) {
  if (mime === 'image/jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === 'image/png') return buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/webp') return buf.subarray(0,4).toString() === 'RIFF' && buf.subarray(8,12).toString() === 'WEBP';
  if (mime === 'application/pdf') return buf.subarray(0,5).toString() === '%PDF-';
  if (mime.includes('wordprocessingml')) return buf.subarray(0,2).toString() === 'PK';
  return true;
}
async function extractText(mime, buffer) {
  if (mime === 'text/plain') return new TextDecoder('utf-8', {fatal:true}).decode(buffer);
  if (mime.includes('wordprocessingml')) return (await mammoth.extractRawText({buffer})).value;
  if (mime === 'application/pdf') {
    const parser = new PDFParse({data: buffer, stopAtErrors: true});
    try {
      const content = await parser.getText({first: 20});
      return content.text || '';
    } finally { await parser.destroy(); }
  }
  return '';
}
export async function decodeAttachments(input) {
  if (input == null) return {documentText:'',images:[],fileNames:[]};
  if (!Array.isArray(input) || input.length > MAX_ATTACHMENTS) fail('Можно добавить не более трёх файлов.');
  let totalBytes = 0, docText = '', images = [];
  const fileNames = [];
  for (const item of input) {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 110) : '';
    if (!name || /[\\/\x00-\x1f]/.test(name)) fail('Некорректное название файла.');
    const {mime,buffer} = parseDataUrl(item.data);
    totalBytes += buffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail('Общий размер вложений не должен превышать 7 МБ.', 413);
    const ext = fileExt(name);
    if (IMAGE_MIMES.has(mime)) {
      if (buffer.length > MAX_IMAGE_BYTES) fail('Фотография слишком большая: максимум 2 МБ после сжатия.', 413);
      if (!matchesSignature(mime,buffer)) fail('Не удалось проверить изображение.');
      images.push({mime,data:'data:'+mime+';base64,'+buffer.toString('base64')});
    } else if (DOC_MIMES.get(ext) === mime) {
      if (buffer.length > MAX_DOCUMENT_BYTES) fail('Документ слишком большой: максимум 4 МБ.',413);
      if (!matchesSignature(mime,buffer)) fail('Некорректный формат документа.');
      let extracted = '';
      try { extracted = await extractText(mime,buffer); } catch {
        fail('Не удалось прочитать документ «'+name+'». Проверьте формат файла.');
      }
      if (!extracted.trim()) fail('В документе «'+name+'» нет доступного текста. Для сканированного PDF прикрепите фото страницы.');
      docText += '\n\n[Документ: '+name+']\n'+extracted.trim().slice(0, 6800);
    } else {
      fail('Поддерживаются JPG, PNG, WebP, PDF, DOCX и TXT.');
    }
    fileNames.push(name);
  }
  return {documentText:docText.trim().slice(0, 9000),images,fileNames};
}
