window.chat = function() {};

window.chat.handleTabCompletion = function() {
  var el = $('#chatinput input');
  var curPos = el.get(0).selectionStart;
  var text = el.val();
  var word = text.slice(0, curPos).replace(/.*\b([a-z0-9-_])/, '$1').toLowerCase();

  var list = $('#chat > div:visible mark');
  list = list.map(function(ind, mark) { return $(mark).text(); } );
  list = uniqueArray(list);

  var nick = null;
  for(var i = 0; i < list.length; i++) {
    if(!list[i].toLowerCase().startsWith(word)) continue;
    if(nick && nick !== list[i]) {
      log.warn('More than one nick matches, aborting. ('+list[i]+' vs '+nick+')');
      return;
    }
    nick = list[i];
  }
  if(!nick) {
    return;
  }

  var posStart = curPos - word.length;
  var newText = text.substring(0, posStart);
  var atPresent = text.substring(posStart-1, posStart) === '@';
  newText += (atPresent ? '' : '@') + nick + ' ';
  newText += text.substring(curPos);
  el.val(newText);
}

//
// clear management
//

window.chat._oldBBox = null;
window.chat.genPostData = function(channel, storageHash, getOlderMsgs) {
  if (typeof channel !== 'string') {
    throw new Error('API changed: isFaction flag now a channel string - all, faction, alerts');
  }

  var b = clampLatLngBounds(map.getBounds());

  // set a current bounding box if none set so far
  if (!chat._oldBBox) chat._oldBBox = b;

  // to avoid unnecessary chat refreshes, a small difference compared to the previous bounding box
  // is not considered different
  var CHAT_BOUNDINGBOX_SAME_FACTOR = 0.1;
  // if the old and new box contain each other, after expanding by the factor, don't reset chat
  if (!(b.pad(CHAT_BOUNDINGBOX_SAME_FACTOR).contains(chat._oldBBox) && chat._oldBBox.pad(CHAT_BOUNDINGBOX_SAME_FACTOR).contains(b))) {
    log.log('Bounding Box changed, chat will be cleared (old: '+chat._oldBBox.toBBoxString()+'; new: '+b.toBBoxString()+')');

    // need to reset these flags now because clearing will only occur
    // after the request is finished – i.e. there would be one almost
    // useless request.
    window.chat.commTabs.forEach(function (entry) {
      if (entry.localBounds) {
        chat.initChannelData(entry);
        $('#chat' + entry.channel).data('needsClearing', true);
      }
    });

    chat._oldBBox = b;
  }

  var ne = b.getNorthEast();
  var sw = b.getSouthWest();
  var data = {
//    desiredNumItems: isFaction ? CHAT_FACTION_ITEMS : CHAT_PUBLIC_ITEMS ,
    minLatE6: Math.round(sw.lat*1E6),
    minLngE6: Math.round(sw.lng*1E6),
    maxLatE6: Math.round(ne.lat*1E6),
    maxLngE6: Math.round(ne.lng*1E6),
    minTimestampMs: -1,
    maxTimestampMs: -1,
    tab: channel,
  }

  if(getOlderMsgs) {
    // ask for older chat when scrolling up
    data = $.extend(data, {
      maxTimestampMs: storageHash.oldestTimestamp,
      plextContinuationGuid: storageHash.oldestGUID
    });
  } else {
    // ask for newer chat
    var min = storageHash.newestTimestamp;
    // the initial request will have both timestamp values set to -1,
    // thus we receive the newest desiredNumItems. After that, we will
    // only receive messages with a timestamp greater or equal to min
    // above.
    // After resuming from idle, there might be more new messages than
    // desiredNumItems. So on the first request, we are not really up to
    // date. We will eventually catch up, as long as there are less new
    // messages than desiredNumItems per each refresh cycle.
    // A proper solution would be to query until no more new results are
    // returned. Another way would be to set desiredNumItems to a very
    // large number so we really get all new messages since the last
    // request. Setting desiredNumItems to -1 does unfortunately not
    // work.
    // Currently this edge case is not handled. Let’s see if this is a
    // problem in crowded areas.
    $.extend(data, {
      minTimestampMs: min,
      plextContinuationGuid: storageHash.newestGUID
    });
    // when requesting with an actual minimum timestamp, request oldest rather than newest first.
    // this matches the stock intel site, and ensures no gaps when continuing after an extended idle period
    if (min > -1) $.extend(data, {ascendingTimestampOrder: true});
  }
  return data;
}

window.chat._requestRunning = {}
window.chat.requestChannel = function (channel, getOlderMsgs, isRetry) {
  if(chat._requestRunning[channel] && !isRetry) return;
  if(isIdle()) return renderUpdateStatus();
  chat._requestRunning[channel] = true;
  $("#chatcontrols a[data-channel='" + channel + "']").addClass('loading');

  var d = chat.genPostData(channel, chat._channels[channel], getOlderMsgs);
  var r = window.postAjax(
    'getPlexts',
    d,
    function(data, textStatus, jqXHR) { chat.handleChannel(channel, data, getOlderMsgs, d.ascendingTimestampOrder); },
    isRetry
      ? function() { window.chat._requestRunning[channel] = false; }
      : function() { window.chat.requestChannel(channel, getOlderMsgs, true) }
  );
};

window.chat.handleChannel = function (channel, data, olderMsgs, ascendingTimestampOrder) {
  chat._requestRunning[channel] = false;
  $("#chatcontrols a[data-channel='" + channel + "']").removeClass('loading');

  if(!data || !data.result) {
    window.failedRequestCount++;
    return log.warn(channel + ' chat error. Waiting for next auto-refresh.');
  }

  if (!data.result.length && !$('#chat'+channel).data('needsClearing')) {
    // no new data and current data in chat._faction.data is already rendered
    return;
  }

  $('#chat'+channel).data('needsClearing', null);

  var old = chat._channels[channel].oldestGUID;
  chat.writeDataToHash(data, chat._channels[channel], false, olderMsgs, ascendingTimestampOrder);
  var oldMsgsWereAdded = old !== chat._channels[channel].oldestGUID;

  var hook = channel + 'ChatDataAvailable';
  // backward compability
  if (channel === 'all') hook = 'publicChatDataAvailable';
  runHooks(hook, {raw: data, result: data.result, processed: chat._channels[channel].data});

  // generic hook
  runHooks('chatDataAvailable', {channel: channel, raw: data, result: data.result, processed: chat._channels[channel].data});

  window.chat.renderChannel(channel, oldMsgsWereAdded);
};

window.chat.renderChannel = function(channel, oldMsgsWereAdded) {
  chat.renderData(chat._channels[channel].data, 'chat' + channel, oldMsgsWereAdded, chat._channels[channel].guids);
}

//
// common
//

window.chat.nicknameClicked = function(event, nickname) {
  var hookData = { event: event, nickname: nickname };

  if (window.runHooks('nicknameClicked', hookData)) {
    window.chat.addNickname('@' + nickname);
  }

  event.preventDefault();
  event.stopPropagation();
  return false;
}

window.chat.writeDataToHash = function(newData, storageHash, isPublicChannel, isOlderMsgs, isAscendingOrder) {

  if (newData.result.length > 0) {
    //track oldest + newest timestamps/GUID
    var first = {
      guid: newData.result[0][0],
      time: newData.result[0][1]
    };
    var last = {
      guid: newData.result[newData.result.length-1][0],
      time: newData.result[newData.result.length-1][1]
    };
    if (isAscendingOrder) {
      var temp = first;
      first = last;
      last = temp;
    }
    if (storageHash.oldestTimestamp === -1 || storageHash.oldestTimestamp >= last.time) {
      if (isOlderMsgs || storageHash.oldestTimestamp != last.time) {
        storageHash.oldestTimestamp = last.time;
        storageHash.oldestGUID = last.guid;
      }
    }
    if (storageHash.newestTimestamp === -1 || storageHash.newestTimestamp <= first.time) {
      if (!isOlderMsgs || storageHash.newestTimestamp != first.time) {
        storageHash.newestTimestamp = first.time;
        storageHash.newestGUID = first.guid;
      }
    }
  }
  $.each(newData.result, function(ind, json) {
    // avoid duplicates
    if(json[0] in storageHash.data) return true;

    var isSecureMessage = false;
    var msgToPlayer = false;

    var time = json[1];
    var team = json[2].plext.team === 'RESISTANCE' ? TEAM_RES : TEAM_ENL;
    var auto = json[2].plext.plextType !== 'PLAYER_GENERATED';
    var systemNarrowcast = json[2].plext.plextType === 'SYSTEM_NARROWCAST';

    //remove "Your X on Y was destroyed by Z" from the faction channel
//    if (systemNarrowcast && !isPublicChannel) return true;

    var msg = '', nick = '';
    $.each(json[2].plext.markup, function(ind, markup) {
      switch(markup[0]) {
      case 'SENDER': // user generated messages
        nick = markup[1].plain.slice(0, -2); // cut “: ” at end
        break;

      case 'PLAYER': // automatically generated messages
        nick = markup[1].plain;
        team = markup[1].team === 'RESISTANCE' ? TEAM_RES : TEAM_ENL;
        if(ind > 0) msg += nick; // don’t repeat nick directly
        break;

      case 'TEXT':
        msg += $('<div/>').text(markup[1].plain).html().autoLink();
        break;

      case 'AT_PLAYER':
        var thisToPlayer = (markup[1].plain == ('@'+window.PLAYER.nickname));
        var spanClass = thisToPlayer ? "pl_nudge_me" : (markup[1].team + " pl_nudge_player");
        var atPlayerName = markup[1].plain.replace(/^@/, "");
        msg += $('<div/>').html($('<span/>')
                          .attr('class', spanClass)
                          .attr('onclick',"window.chat.nicknameClicked(event, '"+atPlayerName+"')")
                          .text(markup[1].plain)).html();
        msgToPlayer = msgToPlayer || thisToPlayer;
        break;

      case 'PORTAL':
        var lat = markup[1].latE6/1E6, lng = markup[1].lngE6/1E6;
        var perma = window.makePermalink([lat,lng]);
        var js = 'window.selectPortalByLatLng('+lat+', '+lng+');return false';

        msg += '<a onclick="'+js+'"'
          + ' title="'+markup[1].address+'"'
          + ' href="'+perma+'" class="help">'
          + window.chat.getChatPortalName(markup[1])
          + '</a>';
        break;

      case 'SECURE':
        //NOTE: we won't add the '[secure]' string here - it'll be handled below instead
        isSecureMessage = true;
        break;

      default:
        //handle unknown types by outputting the plain text version, marked with it's type
        msg += $('<div/>').text(markup[0]+':<'+markup[1].plain+'>').html();
        break;
      }
    });


//    //skip secure messages on the public channel
//    if (isPublicChannel && isSecureMessage) return true;

//    //skip public messages (e.g. @player mentions) on the secure channel
//    if ((!isPublicChannel) && (!isSecureMessage)) return true;


    //NOTE: these two are redundant with the above two tests in place - but things have changed...
    //from the server, private channel messages are flagged with a SECURE string '[secure] ', and appear in
    //both the public and private channels
    //we don't include this '[secure]' text above, as it's redundant in the faction-only channel
    //let's add it here though if we have a secure message in the public channel, or the reverse if a non-secure in the faction one
    if (!auto && !(isPublicChannel===false) && isSecureMessage) msg = '<span style="color: #f88; background-color: #500;">[faction]</span> ' + msg;
    //and, add the reverse - a 'public' marker to messages in the private channel
    if (!auto && !(isPublicChannel===true) && (!isSecureMessage)) msg = '<span style="color: #ff6; background-color: #550">[public]</span> ' + msg;


    // format: timestamp, autogenerated, HTML message
    storageHash.data[json[0]] = [json[1], auto, chat.renderMsg(msg, nick, time, team, msgToPlayer, systemNarrowcast), nick];

  });
}

// Override portal names that are used over and over, such as 'US Post Office'
window.chat.getChatPortalName = function(markup) {
  var name = markup.name;
  if(name === 'US Post Office') {
    var address = markup.address.split(',');
    name = 'USPS: ' + address[0];
  }
  return name;
}

// renders data from the data-hash to the element defined by the given
// ID. Set 3rd argument to true if it is likely that old data has been
// added. Latter is only required for scrolling.
window.chat.renderData = function(data, element, likelyWereOldMsgs) {
  var elm = $('#'+element);
  if(elm.is(':hidden')) return;

  // discard guids and sort old to new
//TODO? stable sort, to preserve server message ordering? or sort by GUID if timestamps equal?
  var vals = $.map(data, function(v, k) { return [v]; });
  vals = vals.sort(function(a, b) { return a[0]-b[0]; });

  // render to string with date separators inserted
  var msgs = '';
  var prevTime = null;
  $.each(vals, function(ind, msg) {
    var nextTime = new Date(msg[0]).toLocaleDateString();
    if(prevTime && prevTime !== nextTime)
      msgs += chat.renderDivider(nextTime);
    msgs += msg[2];
    prevTime = nextTime;
  });

  var scrollBefore = scrollBottom(elm);
  elm.html('<table>' + msgs + '</table>');
  chat.keepScrollPosition(elm, scrollBefore, likelyWereOldMsgs);
}


window.chat.renderDivider = function(text) {
  var d = ' ──────────────────────────────────────────────────────────────────────────';
  return '<tr><td colspan="3" style="padding-top:3px"><summary>─ ' + text + d + '</summary></td></tr>';
}


window.chat.renderMsg = function(msg, nick, time, team, msgToPlayer, systemNarrowcast) {
  var ta = unixTimeToHHmm(time);
  var tb = unixTimeToDateTimeString(time, true);
  //add <small> tags around the milliseconds
  tb = (tb.slice(0,19)+'<small class="milliseconds">'+tb.slice(19)+'</small>').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // help cursor via “#chat time”
  var t = '<time title="'+tb+'" data-timestamp="'+time+'">'+ta+'</time>';
  if ( msgToPlayer )
  {
    t = '<div class="pl_nudge_date">' + t + '</div><div class="pl_nudge_pointy_spacer"></div>';
  }
  if (systemNarrowcast)
  {
    msg = '<div class="system_narrowcast">' + msg + '</div>';
  }
  var color = COLORS[team];
  if (nick === window.PLAYER.nickname) color = '#fd6';    //highlight things said/done by the player in a unique colour (similar to @player mentions from others in the chat text itself)
  var s = 'style="cursor:pointer; color:'+color+'"';
  var i = ['<span class="invisep">&lt;</span>', '<span class="invisep">&gt;</span>'];
  return '<tr><td>'+t+'</td><td>'+i[0]+'<mark class="nickname" ' + s + '>'+ nick+'</mark>'+i[1]+'</td><td>'+msg+'</td></tr>';
}

window.chat.addNickname= function(nick) {
  var c = document.getElementById("chattext");
  c.value = [c.value.trim(), nick].join(" ").trim() + " ";
  c.focus()
}


//
// Tabs
//


//WORK IN PROGRESS
// 'all' 'faction' and 'alerts' channels are hard coded in several places (including mobile app)
// dont change those channels
window.chat.commTabs = [
// channel: the COMM channel ('tab' parameter in server requests)
// name: visible name
// inputPrompt: string for the input prompt
// inputClass: (optional) class to apply to #chatinput
// sendMessage: (optional) function to send the message (to override the default of sendPlext)
// request: (optional) function to call to request new message
//          first argument is `channel`
//          second is true when trigger from scrolling to top
// render: (optional) function to render channel content
//          argument is `channel`
// localBounds: (optional) if true, reset on view change
  {
    channel: 'all', name:'All', localBounds: true,
    inputPrompt: 'broadcast:', inputClass:'public',
    request: chat.requestChannel, render: chat.renderChannel
  },
  {
    channel: 'faction', name:'Faction', localBounds: true,
    inputPrompt: 'tell faction:', inputClass:'faction',
    request: chat.requestChannel, render: chat.renderChannel
  },
  {
    channel: 'alerts', name:'Alerts',
    inputPrompt: 'tell Jarvis:', inputClass: 'alerts',
    request: chat.requestChannel, render: chat.renderChannel,
    sendMessage: function() {
      alert("Jarvis: A strange game. The only winning move is not to play. How about a nice game of chess?\n(You can't chat to the 'alerts' channel!)");
    }
  },
];

window.chat._channels = {};
window.chat.initChannelData = function (commTab) {
  window.chat._channels[commTab.channel] = {data:{}, guids: [], oldestTimestamp:-1, newestTimestamp:-1};
};

window.chat.getActive = function() {
  return $('#chatcontrols .active').data('channel');
}

window.chat.getCommTab = function (tab) {
  var channelObject;
  chat.commTabs.forEach(function (entry) {
    if (entry.channel === tab)
      channelObject = entry;
  });
  return channelObject;
};


window.chat.toggle = function() {
  var c = $('#chat, #chatcontrols');
  if(c.hasClass('expand')) {
    c.removeClass('expand');
    var div = $('#chat > div:visible');
    div.data('ignoreNextScroll', true);
    div.scrollTop(99999999); // scroll to bottom
    $('.leaflet-control').removeClass('chat-expand');
  } else {
    c.addClass('expand');
    $('.leaflet-control').addClass('chat-expand');
    chat.needMoreMessages();
  }
};


// called by plugins (or other things?) that need to monitor COMM data streams when the user is not viewing them
// instance: a unique string identifying the plugin requesting background COMM
// channel: either 'all', 'faction' or (soon) 'alerts' - others possible in the future
// flag: true for data wanted, false for not wanted
window.chat.backgroundChannelData = function(instance,channel,flag) {
  //first, store the state for this instance
  if (!window.chat.backgroundInstanceChannel) window.chat.backgroundInstanceChannel = {};
  if (!window.chat.backgroundInstanceChannel[instance]) window.chat.backgroundInstanceChannel[instance] = {};
  window.chat.backgroundInstanceChannel[instance][channel] = flag;

  //now, to simplify the request code, merge the flags for all instances into one
  // 1. clear existing overall flags
  window.chat.backgroundChannels = {};
  // 2. for each instance monitoring COMM...
  $.each(window.chat.backgroundInstanceChannel, function(instance,channels) {
    // 3. and for each channel monitored by this instance...
    $.each(window.chat.backgroundInstanceChannel[instance],function(channel,flag) {
      // 4. if it's monitored, set the channel flag
      if (flag) window.chat.backgroundChannels[channel] = true;
    });
  });

}


window.chat.request = function() {
  var channel = chat.getActive();
  chat.commTabs.forEach(function (entry) {
    if (channel === entry.channel || (window.chat.backgroundChannels && window.chat.backgroundChannels[entry.channel])) {
      if (entry.request)
        entry.request(entry.channel, false);
    }
  });
}


// checks if there are enough messages in the selected chat tab and
// loads more if not.
window.chat.needMoreMessages = function() {
  var activeTab = chat.getActive();
  var commTab = chat.getCommTab(activeTab);
  if(!commTab.request) return;

  var activeChat = $('#chat > :visible');
  if(activeChat.length === 0) return;

  var hasScrollbar = scrollBottom(activeChat) !== 0 || activeChat.scrollTop() !== 0;
  var nearTop = activeChat.scrollTop() <= CHAT_REQUEST_SCROLL_TOP;
  if(hasScrollbar && !nearTop) return;

  commTab.request(commTab.channel, false);
};


window.chat.chooseTab = function(tab) {
  if (chat.commTabs.every(function (entry) { return entry.channel !== tab; })) {
    var tabsAvalaible = chat.commTabs.map(function (entry) { return '"' + entry.channel + '"'; }).join(', ');
    log.warn('chat tab "'+tab+'" requested - but only ' + tabsAvalaible + ' are valid - assuming "all" wanted');
    tab = 'all';
  }

  var oldTab = chat.getActive();

  localStorage['iitc-chat-tab'] = tab;

  var oldCommTab = chat.getCommTab(oldTab);
  var commTab = chat.getCommTab(tab);

  var chatInput = $('#chatinput');
  if (oldCommTab && oldCommTab.inputClass) chatInput.removeClass(oldCommTab.inputClass);
  if (commTab.inputClass) chatInput.addClass(commTab.inputClass);

  var mark = $('#chatinput mark');
  mark.text(commTab.inputPrompt);

  $('#chatcontrols .active').removeClass('active');
  $("#chatcontrols a[data-channel='" + tab + "']").addClass('active');

  if (tab != oldTab) startRefreshTimeout(0.1*1000); //only chat uses the refresh timer stuff, so a perfect way of forcing an early refresh after a tab change

  $('#chat > div').hide();

  var elm = $('#chat' + tab);
  elm.show();

  if (commTab.render) commTab.render(tab);

  if(elm.data('needsScrollTop')) {
    elm.data('ignoreNextScroll', true);
    elm.scrollTop(elm.data('needsScrollTop'));
    elm.data('needsScrollTop', null);
  }
}

window.chat.show = function(name) {
    window.isSmartphone()
        ? $('#updatestatus').hide()
        : $('#updatestatus').show();
    $('#chat, #chatinput').show();

    window.chat.chooseTab(name);
}

window.chat.chooser = function(event) {
  var t = $(event.target);
  var tab = t.data('channel');
  window.chat.chooseTab(tab);
}

// contains the logic to keep the correct scroll position.
window.chat.keepScrollPosition = function(box, scrollBefore, isOldMsgs) {
  // If scrolled down completely, keep it that way so new messages can
  // be seen easily. If scrolled up, only need to fix scroll position
  // when old messages are added. New messages added at the bottom don’t
  // change the view and enabling this would make the chat scroll down
  // for every added message, even if the user wants to read old stuff.

  if(box.is(':hidden') && !isOldMsgs) {
    box.data('needsScrollTop', 99999999);
    return;
  }

  if(scrollBefore === 0 || isOldMsgs) {
    box.data('ignoreNextScroll', true);
    box.scrollTop(box.scrollTop() + (scrollBottom(box)-scrollBefore));
  }
}

//
// comm tab api
//

function createCommTab (commTab) {
  var chatControls = $('#chatcontrols');
  var chatDiv = $('#chat');
  var accessLink = L.Util.template(
    '<a data-channel="{channel}" accesskey="{index}" title="[{index}]">{name}</a>',
    commTab
  );
  $(accessLink).appendTo(chatControls).click(window.chat.chooser);

  var channelDiv = L.Util.template(
    '<div id="chat{channel}"><table></table></div>',
    commTab
  );
  var elm = $(channelDiv).appendTo(chatDiv);
  if (commTab.request) {
    elm.scroll(function() {
      var t = $(this);
      if(t.data('ignoreNextScroll')) return t.data('ignoreNextScroll', false);
      if(t.scrollTop() < CHAT_REQUEST_SCROLL_TOP)
        commTab.request(commTab.channel, true);
      if(scrollBottom(t) === 0)
        commTab.request(commTab.channel, false);
    });
  }

  // pane
  if (useAndroidPanes()) {
    // exlude hard coded panes
    if (commTab.channel !== 'all' && commTab.channel !== 'faction' && commTab.channel !== 'alerts') {
      android.addPane(commTab.channel, commTab.name, 'ic_action_view_as_list');
    }
  }
}

var isTabsSetup = false;
window.chat.addCommTab = function (commTab) {
  // deny reserved name
  if (commTab.channel == 'info' || commTab.channel == 'map') {
    log.warn('could not add commtab "' + commTab.channel + '": reserved');
    return false;
  }
  if (chat.getCommTab(commTab.channel)) {
    log.warn('could not add commtab "' + commTab.channel + '": already exist');
    return false;
  }

  chat.commTabs.push(commTab);
  commTab.index = chat.commTabs.length;

  if (isTabsSetup) createCommTab(commTab);

  return true;
};


//
// setup
//

window.chat.setupTabs = function () {
  isTabsSetup = true;
  window.chat.commTabs.forEach(function (entry, i) {
    entry.index = i+1;
    chat.initChannelData(entry);
    createCommTab(entry);
  });
};

window.chat.setup = function() {
  chat.setupTabs();

  if (localStorage['iitc-chat-tab']) {
    chat.chooseTab(localStorage['iitc-chat-tab']);
 }

  $('#chatcontrols, #chat, #chatinput').show();

  $('#chatcontrols a:first').click(window.chat.toggle);


  $('#chatinput').click(function() {
    $('#chatinput input').focus();
  });

  window.chat.setupTime();
  window.chat.setupPosting();

  window.requests.addRefreshFunction(chat.request);

  var cls = PLAYER.team === 'RESISTANCE' ? 'res' : 'enl';
  $('#chatinput mark').addClass(cls);

  $(document).on('click', '.nickname', function(event) {
    return window.chat.nicknameClicked(event, $(this).text());
  });
}


window.chat.setupTime = function() {
  var inputTime = $('#chatinput time');
  var updateTime = function() {
    if(window.isIdle()) return;
    var d = new Date();
    var h = d.getHours() + ''; if(h.length === 1) h = '0' + h;
    var m = d.getMinutes() + ''; if(m.length === 1) m = '0' + m;
    inputTime.text(h+':'+m);
    // update ON the minute (1ms after)
    setTimeout(updateTime, (60 - d.getSeconds()) * 1000 + 1);
  };
  updateTime();
  window.addResumeFunction(updateTime);
}


//
// posting
//


window.chat.setupPosting = function() {
  if (!isSmartphone()) {
    $('#chatinput input').keydown(function(event) {
      try {
        var kc = (event.keyCode ? event.keyCode : event.which);
        if(kc === 13) { // enter
          chat.postMsg();
          event.preventDefault();
        } else if (kc === 9) { // tab
          event.preventDefault();
          window.chat.handleTabCompletion();
        }
      } catch (e) {
        log.error(e);
        //if (e.stack) { console.error(e.stack); }
      }
    });
  }

  $('#chatinput').submit(function(event) {
    event.preventDefault();
    chat.postMsg();
  });
}


window.chat.postMsg = function() {
  var c = chat.getActive();
  var commTab = chat.getCommTab(c);

  var msg = $.trim($('#chatinput input').val());
  if(!msg || msg === '') return;

  if (commTab.sendMessage) return commTab.sendMessage(msg);

  var latlng = map.getCenter();

  var data = {message: msg,
              latE6: Math.round(latlng.lat*1E6),
              lngE6: Math.round(latlng.lng*1E6),
              tab: c};

  var errMsg = 'Your message could not be delivered. You can copy&' +
               'paste it here and try again if you want:\n\n' + msg;

  window.postAjax('sendPlext', data,
    function(response) {
      if(response.error) alert(errMsg);
      startRefreshTimeout(0.1*1000); //only chat uses the refresh timer stuff, so a perfect way of forcing an early refresh after a send message
    },
    function() {
      alert(errMsg);
    }
  );

  $('#chatinput input').val('');
}
