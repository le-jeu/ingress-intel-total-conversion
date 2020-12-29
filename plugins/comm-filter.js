// @author         jaiperdu
// @name           COMM Filter
// @category       Misc
// @version        0.1.1
// @description    COMM Filter

/*
Re-write from https://github.com/udnp/iitc-plugins/
*/

//todo list
//2) add fracker as a filter
//3) add virus  filter
//4) add checkable filtering for all/faction/alert

const commFilter = function () {};

commFilter.viruses = new Map();

const findVirus = function (guids, data) {
  commFilter.viruses.clear();
  let hide = new Set();
  let last_data = {};
  let amount = 0;
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
      log.virus = false;
      amount = 1;
    }
    else {
      amount += 1;
      log.virus = last_data.guid;
      last_data['comm-filter'].virus = true;
    }
  }
  for (const guid of guids) {
    const log = data[guid][4]['comm-filter'];
    if (log.virus === true)
      commFilter.viruses.set(guid, []);
    else if (log.virus)
      commFilter.viruses.get(log.virus).push(guid);
  }
  for (const [guid, guids] of commFilter.viruses) {
    const parseData = data[guid][4];
    parseData.markup[1][1].plain = 'destroyed ' + (guids.length+1) + ' Resonators on ';
    data[guid][2] = window.chat.renderMsgRow(parseData);
  }
}

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
      }
      if (parseData.markup.length == 6)
        parseData.markup.push('');
      parseData.markup[6] = [
        'TEXT',
        { plain: ' (' + tot.toLocaleString('en-US') + '/' + sum.toLocaleString('en-US') + ')' }
        ];
      data[guid][2] = window.chat.renderMsgRow(parseData);
    }
  }
}

const reParseData = function (data) {
  let parse = {};
  let markup = data.markup;
  let withSender = markup.some(ent => ent[0] == 'SENDER');
  let portals = markup.filter(ent => ent[0] == 'PORTAL').map(ent => ent[1]);
  let numbers = markup.filter(ent => ent[0] == 'TEXT' && !isNaN(ent[1].plain)).map(ent => parseInt(ent[1].plain));
  let atPlayers = markup.filter(ent => ent[0] == 'AT_PLAYER').map(ent =>
    ({
      name: ent[1].plain.slice(1),
      team: ent[1].team === 'RESISTANCE' ? TEAM_RES : TEAM_ENL
    })
  );

  let plainSub = markup.map(ent =>
    (ent[0] == 'TEXT' && !withSender)
    ? isNaN(ent[1].plain)
      ? ent[1].plain
      : 'NUMBER'
    : ent[0]
  ).join('|');

  if (markup[0][0] == 'PLAYER') {
    // <PLAYER| captured |PORTAL (ADDRESS)>
    // <PLAYER| created a Control Field @|PORTAL (ADDRESS)| +|NUMBER| MUs>
    // <PLAYER| deployed a Beacon on |PORTAL (ADDRESS)>
    // <PLAYER| deployed a Battle Beacon on |PORTAL (ADDRESS)>
    // <PLAYER| deployed a Fracker on |PORTAL (ADDRESS)>
    // <PLAYER| deployed a Resonator on |PORTAL (ADDRESS)>
    // <PLAYER| destroyed a Control Field @|PORTAL (ADDRESS)| -|NUMBER| MUs>
    // <PLAYER| destroyed a Resonator on |PORTAL (ADDRESS)>
    // <PLAYER| destroyed the Link |PORTAL (ADDRESS)| to |PORTAL (ADDRESS)>
    // <PLAYER| linked |PORTAL (ADDRESS)| to |PORTAL (ADDRESS)>
    // <PLAYER| Recursed.>

    parse.type = "unknown player action";
    if (markup[1][1].plain.search('captured') != -1) {
      parse.type = 'capture';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('created') != -1) {
      parse.type = 'field';
      parse.portal = portals[0];
      if (numbers.length > 0)
        parse.mus = numbers[0];
    }
    else if (markup[1][1].plain.search('deployed a Beacon') != -1) {
      parse.type = 'beacon';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('deployed a Battle Beacon') != -1) {
      parse.type = 'battle';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('deployed a Fracker') != -1) {
      parse.type = 'fracker';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('deployed a Resonator') != -1) {
      parse.type = 'deploy';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('destroyed a Control Field') != -1) {
      parse.type = 'destroy field';
      parse.portal = portals[0];
      if (numbers.length > 0)
        parse.mus = numbers[0];
    }
    else if (markup[1][1].plain.search('destroyed a Resonator') != -1) {
      parse.type = 'destroy resonator';
      parse.portal = portals[0];
    }
    else if (markup[1][1].plain.search('destroyed the Link') != -1) {
      parse.type = 'destroy link';
      parse.from = portals[0];
      parse.to = portals[1];
    }
    else if (markup[1][1].plain.search('linked') != -1) {
      parse.type = 'link';
      parse.from = portals[0];
      parse.to = portals[1];
    } else if (markup[1][1].plain.search('Recursed') != -1) {
      parse.type = 'recurse';
    } else {
      parse.portals = portals;
    }
  }

  if (markup[0][0] == 'FACTION') {
    // <FACTION| won a Battle Beacon on |PORTAL (ADDRESS)>
    parse.faction = markup[0][1].team;
    parse.type = "unknown faction action";
    if (markup[1][1].plain.search('won a Battle Beacon on') != -1) {
      parse.type = 'battle won';
      parse.portal = portals[0];
    }
  }

  if (data.narrowcast) {
    // <Your Link |PORTAL (ADDRESS)| to |PORTAL (ADDRESS)| destroyed by |PLAYER>
    // <Your Portal |PORTAL (ADDRESS)| is under attack by |PLAYER>
    // <Your Portal |PORTAL (ADDRESS)| neutralized by |PLAYER>
    // <Your Kinetic Capsule is now ready.>
    let players = markup.filter(ent => ent[0] == 'PLAYER').map(ent => ent[1]);
    if (markup[0][1].plain.search("Link") != -1) {
      parse.type = 'destroy link';
      parse.from = portals[0];
      parse.to = portals[1];
    }
    else if (markup[0][1].plain.search("Kinetic") != -1) {
      parse.type = 'kinetic';
    }
    else if (markup.length >= 2 && markup[2][1].plain.search("neutralized") != -1) {
      parse.type = 'destroy portal';
      parse.portal = portals[0];
    }
    else {
      parse.type = 'attack portal';
      parse.portal = portals[0];
    }
  }
  // drop secure entity
  if (data.secure)
    markup = markup.slice(1);

  if (markup[0][0] == 'SENDER') {
    // <SENDER| blah |@PLAYER| blah |@PLAYER| blah >
    // <[secure] |SENDER| blah |@PLAYER| blah |@PLAYER| blah >
    parse.type = "chat";
    parse.mentions = atPlayers;
    parse.message = markup.slice(1).map(ent => ent[1].plain).join('').trim();
  }
  else if (!parse.type) {
    // <[secure] | |PLAYER| captured their first Portal.>
    // <[secure] | |PLAYER| created their first Control Field>
    // <[secure] | |PLAYER| created their first Link.>
    let players = markup.filter(ent => ent[0] == 'PLAYER').map(ent => ent[1]);
    if (plainSub.search('first Portal') != -1)
      parse.type = 'first capture';
    else if (plainSub.search('first Control') != -1)
      parse.type = 'first field';
    else if (plainSub.search('first Link') != -1)
      parse.type = 'first link';
  }

  data['comm-filter'] = parse;
};

const updateCSS = function () {
  let elm = document.getElementById('comm-filter-css');
  if (!elm) {
    elm = document.createElement('style');
    document.body.appendChild(elm);
    elm.id = 'comm-filter-css'
  }

  elm.textContent = '';

  const viruses = [];
  let hidden = [];
  for (const [guid, guids] of commFilter.viruses) {
    viruses.push(guid);
    hidden = hidden.concat(guids);
  }

  let content = '';
  if (viruses.length > 0) {
    content += viruses.map((guid) => '#chat tr[data-guid="' + guid + '"] td:nth-child(3):before').join(',\n')
      + '{ content: "[virus]"; color: #f88; background-color: #500; }\n';
  }
  if (hidden.length > 0) {
    content += hidden.map((guid) => '#chat tr[data-guid="' + guid + '"]').join(',\n')
      + '{ display: none; }\n';
  }

  elm.textContent = content;
}

const reparsePublicData = function (data) {
  const public = window.chat._public;
  $.each(public.data, function(ind, msg) {
    if (msg[4]['comm-filter'] == undefined)
      reParseData(msg[4]);
  });

  computeMUs(public.guids, public.data);
  findVirus(public.guids, public.data);

  updateCSS();
}

window.plugin.commFilter = commFilter;

var setup = function() {
  window.addHook('publicChatDataAvailable', reparsePublicData);
};
