// Portal Filter

// basic exclusion filter
window._filters = {};

window.filterPortal = function(portal) {
  return !Object.values(window._filters).some(function (f) {
    if (typeof f === 'function') return f(portal);
    if (!f.portal) return false;
    if (!f.data) return true;
    for (var prop in f.data)
      if (portal.options.data[prop] === f.data[prop])
        return true;
    return false;
  })
};

window.filterLink = function (link) {
  return !Object.values(window._filters).some(function (f) {
    if (typeof f === 'function') return f(link);
    if (!f.link) return false;
    if (!f.data) return true;
    for (var prop in f.data)
      if (link.options.data[prop] === f.data[prop])
        return true;
    return false;
  })
};

window.filterField = function (field) {
  return !Object.values(window._filters).some(function (f) {
    if (typeof f === 'function') return f(field);
    if (!f.field) return false;
    if (!f.data) return true;
    for (var prop in f.data)
      if (field.options.data[prop] === f.data[prop])
        return true;
    return false;
  })
};
