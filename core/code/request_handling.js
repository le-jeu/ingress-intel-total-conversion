
// REQUEST HANDLING //////////////////////////////////////////////////
// note: only meant for portal/links/fields request, everything else
// does not count towards “loading”

IITC.activeRequests = [];
IITC.failedRequestCount = 0;
IITC.statusTotalMapTiles = 0;
IITC.statusCachedMapTiles = 0;
IITC.statusSuccessMapTiles = 0;
IITC.statusStaleMapTiles = 0;
IITC.statusErrorMapTiles = 0;

var requests = function() {};
IITC.requests = requests;

//time of last refresh
requests._lastRefreshTime = 0;
requests._quickRefreshPending = false;

requests.add = function(ajax) {
  IITC.activeRequests.push(ajax);
  renderUpdateStatus();
}

requests.remove = function(ajax) {
  IITC.activeRequests.splice(IITC.activeRequests.indexOf(ajax), 1);
  renderUpdateStatus();
}

requests.abort = function() {
  $.each(IITC.activeRequests, function(ind, actReq) {
    if(actReq) actReq.abort();
  });

  IITC.activeRequests = [];
  IITC.failedRequestCount = 0;
  IITC.chat._requestPublicRunning  = false;
  IITC.chat._requestFactionRunning  = false;

  renderUpdateStatus();
}



// sets the timer for the next auto refresh. Ensures only one timeout
// is queued. May be given 'override' in milliseconds if time should
// not be guessed automatically. Especially useful if a little delay
// is required, for example when zooming.
window.startRefreshTimeout = function(override) {
  // may be required to remove 'paused during interaction' message in
  // status bar
  window.renderUpdateStatus();
  if(refreshTimeout) clearTimeout(refreshTimeout);
  if(override == -1) return;  //don't set a new timeout

  var t = 0;
  if(override) {
    requests._quickRefreshPending = true;
    t = override;
    //ensure override can't cause too fast a refresh if repeatedly used (e.g. lots of scrolling/zooming)
    timeSinceLastRefresh = new Date().getTime()-requests._lastRefreshTime;
    if(timeSinceLastRefresh < 0) timeSinceLastRefresh = 0;  //in case of clock adjustments
    if(timeSinceLastRefresh < MINIMUM_OVERRIDE_REFRESH*1000)
      t = (MINIMUM_OVERRIDE_REFRESH*1000-timeSinceLastRefresh);
  } else {
    requests._quickRefreshPending = false;
    t = REFRESH*1000;

    var adj = ZOOM_LEVEL_ADJ * (18 - map.getZoom());
    if(adj > 0) t += adj*1000;
  }
  var next = new Date(new Date().getTime() + t).toLocaleTimeString();
//  log.log('planned refresh in ' + (t/1000) + ' seconds, at ' + next);
  refreshTimeout = setTimeout(requests._callOnRefreshFunctions, t);
  renderUpdateStatus();
}

requests._onRefreshFunctions = [];
requests._callOnRefreshFunctions = function() {
//  log.log('running refresh at ' + new Date().toLocaleTimeString());
  startRefreshTimeout();

  if(isIdle()) {
//    log.log('user has been idle for ' + idleTime + ' seconds, or window hidden. Skipping refresh.');
    renderUpdateStatus();
    return;
  }

//  log.log('refreshing');

  //store the timestamp of this refresh
  requests._lastRefreshTime = new Date().getTime();

  $.each(requests._onRefreshFunctions, function(ind, f) {
    f();
  });
}


// add method here to be notified of auto-refreshes
requests.addRefreshFunction = function(f) {
  requests._onRefreshFunctions.push(f);
}

requests.isLastRequest = function(action) {
  var result = true;
  $.each(IITC.activeRequests, function(ind, req) {
    if(req.action === action) {
      result = false;
      return false;
    }
  });
  return result;
}
