// Portal Filter

// basic exclusion filter
window._filters = {};

window.filterPortal = function(p) {
  return !Object.values(window._filters).some(function (f) {
  	if (typeof f === 'function') return f(p);
    for (var prop in f)
      if (p.options.data[prop] == f[prop])
        return true;
    return false;
  })
};
