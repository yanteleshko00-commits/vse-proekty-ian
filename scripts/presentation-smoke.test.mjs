import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const {createPptxBuffer,createPresentationPdfBuffer}=await import('../server.js');
const plan={title:'Школьный проект о чтении',summary:'Проверка создания файлов на русском языке.',slides:[
  {type:'cover',title:'Школьный проект о чтении',subtitle:'Польза чтения для школьников'},
  {type:'bullets',title:'Зачем читать',body:'Чтение развивает внимание и словарный запас.',bullets:['Выбираем книгу','Читаем каждый день','Обсуждаем прочитанное']},
  {type:'quote',title:'Вывод',quote:'Регулярное чтение помогает учиться.'}
]};
test('PPTX generation creates a real OpenXML ZIP with three slides',async()=>{
 const data=await createPptxBuffer(plan);
 assert.ok(Buffer.isBuffer(data)&&data.length>5000);
 assert.equal(data.subarray(0,4).toString('hex'),'504b0304');
 for(let i=1;i<=3;i++)assert.ok(data.includes(Buffer.from('ppt/slides/slide'+i+'.xml')));
 assert.ok(!data.includes(Buffer.from('ppt/slides/slide4.xml')));
});
test('PDF generation creates a real PDF with the expected number of pages',async()=>{
 const data=await createPresentationPdfBuffer(plan);
 assert.ok(Buffer.isBuffer(data)&&data.length>1000);
 assert.equal(data.subarray(0,5).toString(),'%PDF-');
 const source=data.toString('latin1');
 assert.equal((source.match(/\/Type\s*\/Page\b/g)||[]).length,3);
 assert.ok(source.includes('%%EOF'));
});
