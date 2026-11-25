(function () {
  var intervalMs = 10 * 60 * 1000;
  var lastPing = 0;
  var pending = false;

  function pingServer() {
    if (pending || (lastPing && Date.now() - lastPing < intervalMs)) return;
    pending = true;
    fetch('/api/keep-alive', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin'
    }).then(function (response) {
      if (!response.ok) throw new Error('Keep-alive request failed');
      lastPing = Date.now();
    }).catch(function () {
      // A later interval or return to the tab will retry without reloading the page.
    }).finally(function () {
      pending = false;
    });
  }

  pingServer();
  window.setInterval(pingServer, intervalMs);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') pingServer();
  });
  window.addEventListener('online', pingServer);
})();
