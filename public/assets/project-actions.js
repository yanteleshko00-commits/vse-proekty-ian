// Static actions replacing the page's inline event handlers; no eval or user-supplied code.
document.addEventListener('click',event=>{
 const target=event.target instanceof Element?event.target.closest('[data-project-action]'):null;
 if(!target)return;
 switch(target.dataset.projectAction){
  case 'action-1': go('how'); break;
  case 'action-2': go('tariffs'); break;
  case 'action-3': openModal('info'); break;
  case 'action-4': go('generator'); break;
  case 'action-5': suggestProjectTopics(); break;
  case 'action-6': startProjectQuiz(); break;
  case 'action-7': editProject(); break;
  case 'action-8': downloadFile('Презентация_проекта.pptx'); break;
  case 'action-9': downloadFile('Презентация_проекта.pdf'); break;
  case 'action-10': downloadFile('Индивидуальный_проект.docx'); break;
  case 'action-11': downloadFile('Проект_текст.pdf'); break;
  case 'action-12': downloadFile('Текст_защиты.pdf'); break;
  case 'action-13': downloadFile('Итоговый_продукт.pdf'); break;
  case 'action-14': downloadFile('Итоговый_продукт.png'); break;
  case 'action-15': downloadAll(); break;
  case 'action-16': window.open('https://t.me/Ian2011t','_blank','noopener,noreferrer'); break;
  case 'action-17': openModal('phone'); break;
  case 'action-18': closeModal('info'); break;
  case 'action-19': closeModal('phone'); break;
  case 'action-20': closeModal('menu'); break;
  case 'action-21': closeModal('menu');go('generator'); break;
  case 'action-22': closeModal('menu');go('tariffs'); break;
  case 'action-23': closeModal('menu');openModal('info'); break;
 }
});
