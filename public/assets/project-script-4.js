(function(){
  var entry=document.getElementById('auth-entry');
  if(!entry)return;
  fetch('/api/me',{credentials:'same-origin'}).then(function(response){
    if(!response.ok)throw new Error('not_signed_in');
    return response.json();
  }).then(function(data){
    if(!data.user||!data.user.name)return;
    entry.textContent='Здравствуйте, '+data.user.name;
    entry.href='/auth/logout';
    entry.setAttribute('aria-label','Выйти из NEXORA ID');
    entry.title='Единый аккаунт NEXORA ID';
  }).catch(function(){});
  var params=new URLSearchParams(location.search);
  if(params.get('login')==='failed'){
    entry.textContent='Повторить вход';
    entry.title='Не удалось выполнить вход. Проверьте настройки NEXORA ID и попробуйте снова.';
    history.replaceState({},'',location.pathname+location.hash);
  }
})();
