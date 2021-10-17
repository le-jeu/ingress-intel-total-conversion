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
  'postAjax',
], window, IITC);


window.IITC = IITC = new Proxy(IITC, {
  get: function (obj, prop) {
    var d = window[prop];
    var e = obj[prop];
    if (d && d !== e) obj[prop] = d;
    return obj[prop];
  },
});