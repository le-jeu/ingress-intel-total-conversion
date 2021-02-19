
// DEBUGGING TOOLS ///////////////////////////////////////////////////
// meant to be used from browser debugger tools and the like.

window.debug = function() {}

window.debug.renderDetails = function() {
  log.log('portals: ' + Object.keys(window.portals).length);
  log.log('links:   ' + Object.keys(window.links).length);
  log.log('fields:  ' + Object.keys(window.fields).length);
}

window.debug.printStackTrace = function() {
  var e = new Error('dummy');
  log.error(e.stack);
  return e.stack;
}



window.debug.console = function() {
  $('#chatdebug').text();
}

window.debug.console.create = function() {
  if (window.chat.addCommTab({
      channel: 'debug',
      name: 'Debug',
      inputPrompt: 'debug:',
      inputClass: 'debug',
      sendMessage: function (msg) {
        var result;
        try {
          result = eval(msg);
        } catch (e) {
          if (e.stack) { log.error(e.stack); }
          throw e; // to trigger native error message
        }
        if (result !== undefined) {
          log.error(result.toString());
        }
        return result;
      },
    })) {
    $("#chatdebug").append('<table></table>');
  }
}

window.debug.console.renderLine = function(text, errorType) {
  // debug.console.create();
  switch(errorType) {
    case 'error':   var color = '#FF424D'; break;
    case 'warning': var color = '#FFDE42'; break;
    default:        var color = '#eee';
  }
  if(typeof text !== 'string' && typeof text !== 'number') {
    var cache = [];
    text = JSON.stringify(text, function(key, value) {
      if(typeof value === 'object' && value !== null) {
        if(cache.indexOf(value) !== -1) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.push(value);
      }
      return value;
    });
    cache = null;
  }
  var d = new Date();
  var ta = d.toLocaleTimeString(); // print line instead maybe?
  var tb = d.toLocaleString();
  var t = '<time title="'+tb+'" data-timestamp="'+d.getTime()+'">'+ta+'</time>';
  var s = 'style="color:'+color+'"';
  var l = '<tr><td>'+t+'</td><td><mark '+s+'>'+errorType+'</mark></td><td>'+text+'</td></tr>';
  $('#chatdebug table').append(l);
}

window.debug.console.log = function(text) {
  debug.console.renderLine(text, 'notice');
}

window.debug.console.warn = function(text) {
  debug.console.renderLine(text, 'warning');
}

window.debug.console.error = function(text) {
  debug.console.renderLine(text, 'error');
}

window.debug.console.overwriteNative = function() {
  window.debug.console.create();

  var nativeConsole = window.console;
  window.console = $.extend({}, window.console);

  function overwrite(which) {
    window.console[which] = function() {
      nativeConsole[which].apply(nativeConsole, arguments);
      window.debug.console[which].apply(window.debug.console, arguments);
    }
  }

  overwrite("log");
  overwrite("warn");
  overwrite("error");
}

window.debug.console.overwriteNativeIfRequired = function() {
  if(!window.console || L.Browser.mobile)
    window.debug.console.overwriteNative();
}
