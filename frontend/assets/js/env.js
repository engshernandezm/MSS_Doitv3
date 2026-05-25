(function () {
  var port = window.location.port;
  var proto = window.location.protocol;
  var host  = window.location.hostname;

  if (port && port !== '80' && port !== '443') {
    // Desarrollo local o red interna con puerto explícito (ej. :5500)
    // → API en :3000 del mismo host
    window.API_URL = proto + '//' + host + ':3000';
  } else {
    // Producción detrás de proxy/dominio (puerto 80 o 443)
    // → Docker debe inyectar API_URL via variable de entorno
    // → Fallback: mismo dominio sin puerto (válido si API y frontend comparten dominio)
    window.API_URL = window.API_URL || proto + '//' + host;
  }
})();
