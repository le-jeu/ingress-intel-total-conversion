/* backward api */

function simpleMap(keys, dest, src) {
  keys.forEach(function (k) {
    dest[k] = src[k];
  });
}

// total-conversion-build.js
simpleMap([
  'script_info',
  'iitcBuildDate',
], window, IITC);

// components
simpleMap([
  'chat',
  'artifact',
  'requests',
  'DataCache',
], window, IITC);

// api
simpleMap([
  'postAjax',
  'runHooks',
  'addHook',
  'removeHook',
], window, IITC);

// expose internals ?
simpleMap([
  '_hooks',
], window, IITC);


window.IITC = IITC = new Proxy(IITC, {
  get: function (obj, prop) {
    var d = window[prop];
    var e = obj[prop];
    if (d && !e) {
      console.info('namespace IITC: missing', prop);
      obj[prop] = d;
    } else if (d && d !== e) {
      console.warn('namespace IITC: window change', prop);
      obj[prop] = d;
    }
    return obj[prop];
  },
});