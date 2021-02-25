// @author         jaiperdu
// @name           COMM Filter
// @category       Misc
// @version        0.1.2
// @description    COMM Filter

/*
Re-write from https://github.com/udnp/iitc-plugins/
*/

// todo list
// 2) add fracker as a filter
// 3) add virus  filter
// 4) add checkable filtering for all/faction/alert

const commFilter = function () {};

commFilter.rules = [
  { type: 'capture', plain: 'PLAYER| captured |PORTAL' },
  { type: 'field', plain: 'PLAYER| created a Control Field @|PORTAL| +|NUMBER| MUs' },
  { type: 'beacon', plain: 'PLAYER| deployed a Beacon on |PORTAL' },
  { type: 'battle', plain: 'PLAYER| deployed a Battle Beacon on |PORTAL' },
  { type: 'fracker', plain: 'PLAYER| deployed a Fracker on |PORTAL' },
  { type: 'resonator', plain: 'PLAYER| deployed a Resonator on |PORTAL' },
  { type: 'destroy field', plain: 'PLAYER| destroyed a Control Field @|PORTAL| -|NUMBER| MUs' },
  { type: 'destroy resonator', plain: 'PLAYER| destroyed a Resonator on |PORTAL' },
  { type: 'destroy link', plain: 'PLAYER| destroyed the Link |PORTAL| to |PORTAL' },
  { type: 'link', plain: 'PLAYER| linked |PORTAL| to |PORTAL' },
  { type: 'recurse', plain: 'PLAYER| Recursed' },
  { type: 'battle result', plain: 'FACTION| won a Battle Beacon on |PORTAL' },
  { type: 'destroy link', plain: 'Your Link |PORTAL| to |PORTAL| destroyed by |PLAYER' },
  { type: 'attack', plain: 'Your Portal |PORTAL| is under attack by |PLAYER' },
  { type: 'neutralize', plain: 'Your Portal |PORTAL| neutralized by |PLAYER' },
  { type: 'kinetic', plain: 'Your Kinetic Capsule is now ready.' },
  { type: 'first capture', plain: '[secure] | |PLAYER| captured their first Portal.' },
  { type: 'first field', plain: '[secure] | |PLAYER| created their first Control Field' },
  { type: 'first link', plain: '[secure] | |PLAYER| created their first Link.' },
  // { type: 'chat', plain: 'SENDER| blah |AT_PLAYER| blah |AT_PLAYER| blah ' },
  // { type: 'faction chat', plain: '[secure] |SENDER| blah |AT_PLAYER| blah |AT_PLAYER| blah ' },
];

const markupType = new Set(['TEXT', 'PLAYER', 'PORTAL', 'FACTION', 'NUMBER', 'AT_PLAYER', 'SENDER']);

const buildRules = function () {
  for (const r of commFilter.rules) {
    const items = r.plain.split('|');
    const markup = [];
    const text = new Map();
    r.portals = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (markupType.has(item)) {
        markup.push(item);
        if (item === 'PORTAL') r.portals++;
        if (item === 'PLAYER') r.player = true;
        if (item === 'FACTION') r.faction = true;
      } else {
        markup.push('TEXT');
        text.set(i, item);
      }
    }
    r.markup = markup;
    r.text = text;
  }
};

const matchChat = function (data) {
  if (data.markup.some((ent) => ent[0] === 'SENDER')) {
    if (data.markup[0][0] === 'SECURE')
      return 'chat faction';
    return 'chat';
  }
  return 'unknown';
};

const matchRule = function (data) {
  for (const r of commFilter.rules) {
    if (r.markup.length !== data.markup.length)
      continue;
    let match = true;
    for (let i = 0; i < r.markup.length; i++) {
      if (r.markup[i] === 'NUMBER') {
        if (data.markup[i][0] !== 'TEXT' || isNaN(data.markup[i][1].plain)) {
          match = false;
          break;
        }
      } else if (r.markup[i] !== data.markup[i][0]) {
        match = false;
        break;
      } else if (r.markup[i] === 'TEXT' && r.text.has(i) && r.text.get(i) !== data.markup[i][1].plain) {
        match = false;
        break;
      }
    }
    if (match) return r.type;
  }

  return matchChat(data);
};

commFilter.viruses = new Map();

const findVirus = function (guids, data) {
  commFilter.viruses.clear();
  let last_data = {};
  for (const guid of guids) {
    const parseData = data[guid][4];
    const log = parseData['comm-filter'];
    if (log.type !== 'destroy resonator')
      continue;
    if (parseData.time !== last_data.time
      || parseData.player.name !== last_data.player.name
      || log.portal.latE6 !== last_data['comm-filter'].portal.latE6
      || log.portal.lngE6 !== last_data['comm-filter'].portal.lngE6) {
      last_data = parseData;
      log.virus = log.portal.team === parseData.player.team;
    } else {
      log.virus = last_data.guid;
      last_data['comm-filter'].virus = true;
    }
  }
  for (const guid of guids) {
    const log = data[guid][4]['comm-filter'];
    if (log.virus === true)
      commFilter.viruses.set(guid, {
        guids: [],
        type: (log.portal.team === 'RESISTANCE') ? 'jarvis' : 'ada'
      });
    else if (log.virus)
      commFilter.viruses.get(log.virus).guids.push(guid);
  }
  for (const [guid, prop] of commFilter.viruses) {
    const parseData = data[guid][4];
    parseData.markup[1][1].plain = 'destroyed ' + (prop.guids.length+1) + ' Resonators on ';
    data[guid][2] = window.chat.renderMsgRow(parseData);
  }
};

const computeMUs = function (guids, data) {
  let agents = new Map();
  let sum = 0;
  for (const guid of guids) {
    const parseData = data[guid][4];
    const log = parseData['comm-filter'];
    if (log.type === 'field') {
      let tot = agents.get(parseData.player.name) || 0;
      tot += log.mus;
      agents.set(parseData.player.name, tot);
      sum += log.mus;
      log.totalMUs = {
        agent: tot,
        all: sum
      };
      if (parseData.markup.length === 6)
        parseData.markup.push('');
      parseData.markup[6] = [
        'TEXT',
        { plain: ' (' + tot.toLocaleString('en-US') + '/' + sum.toLocaleString('en-US') + ')' }
      ];
      data[guid][2] = window.chat.renderMsgRow(parseData);
    }
  }
};

const reParseData = function (data) {
  let parse = {};
  let markup = data.markup;
  let portals = markup.filter(ent => ent[0] === 'PORTAL').map(ent => ent[1]);
  let numbers = markup.filter(ent => ent[0] === 'TEXT' && !isNaN(ent[1].plain)).map(ent => parseInt(ent[1].plain));
  let atPlayers = markup.filter(ent => ent[0] === 'AT_PLAYER').map(ent =>
    ({
      name: ent[1].plain.slice(1),
      team: ent[1].team === 'RESISTANCE' ? TEAM_RES : TEAM_ENL
    })
  );

  parse.type = matchRule(data);

  switch (parse.type) {
  case 'field':
  case 'destroy field':
    parse.mus = numbers[0];
  case 'capture':
  case 'beacon':
  case 'battle':
  case 'fracker':
  case 'resonator':
  case 'destroy resonator':
  case 'battle result':
  case 'neutralize':
  case 'attack':
    parse.portal = portals[0];
    break;
  case 'link':
  case 'destroy link':
    parse.from = portals[0];
    parse.to = portals[1];
    break;
  default:
    if (portals.length > 0) parse.portals = portals;
  }

  if (parse.type === 'battle result')
    parse.faction = markup[0][1].team;

  if (parse.type === 'chat' || parse.type === 'chat faction') {
    parse.mentions = atPlayers;
    parse.message = markup.slice(1 + data.secure).map(ent => ent[1].plain).join('').trim();
  }

  data['comm-filter'] = parse;
};

const updateCSS = function () {
  let elm = document.getElementById('comm-filter-css');
  if (!elm) {
    elm = document.createElement('style');
    document.body.appendChild(elm);
    elm.id = 'comm-filter-css';
  }

  elm.textContent = '';

  const ada = [];
  const jarvis = [];
  let hidden = [];
  for (const [guid, prop] of commFilter.viruses) {
    if (prop.type === 'jarvis')
      jarvis.push(guid);
    else
      ada.push(guid);
    hidden = hidden.concat(prop.guids);
  }

  let content = '#chat td:first-child { width: max-content }\n';
  if (ada.length > 0) {
    content += ada.map((guid) => '#chat tr[data-guid="' + guid + '"] td:nth-child(3):before').join(',\n')
      + '{ content: "[JARVIS]"; color: #f88; background-color: #500; margin-right: .5rem; }\n';
  }
  if (jarvis.length > 0) {
    content += jarvis.map((guid) => '#chat tr[data-guid="' + guid + '"] td:nth-child(3):before').join(',\n')
      + '{ content: "[ADA]"; color: #f88; background-color: #500; margin-right: .5rem; }\n';
  }
  if (hidden.length > 0) {
    content += hidden.map((guid) => '#chat tr[data-guid="' + guid + '"]').join(',\n')
      + '{ display: none; }\n';
  }

  elm.textContent = content;
};

const reparsePublicData = function () {
  const public = window.chat._public;
  $.each(public.data, function(ind, msg) {
    if (msg[4]['comm-filter'] === undefined)
      reParseData(msg[4]);
  });

  computeMUs(public.guids, public.data);
  findVirus(public.guids, public.data);

  updateCSS();
};

const renderTimeCell = function(time, classNames) {
  var ta = new Date(time).toLocaleTimeString();
  var tb = unixTimeToDateTimeString(time, true);
  // add <small> tags around the milliseconds
  tb = (tb.slice(0,19)+'<small class="milliseconds">'+tb.slice(19)+'</small>').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return '<td><time class="' + classNames + '" title="'+tb+'" data-timestamp="'+time+'">'+ta+'</time></td>';
};

window.plugin.commFilter = commFilter;

var setup = function() {
  if (window.chat.renderTimeCell !== undefined) {
    window.chat.renderTimeCell = renderTimeCell;

    buildRules();
    window.addHook('publicChatDataAvailable', reparsePublicData);
  } else console.log('comm-filter:', 'need chat refactor branch');
};
