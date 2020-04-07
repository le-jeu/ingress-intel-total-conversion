// @author         jonatkins
// @name           Mapbox Vector tiles
// @category       Map Tiles
// @version        0.1.1
// @description    Add the Mapbox GL vector tiles as an optional layer.

var mapTileMapbox = {};
window.plugin.mapTileMapbox = mapTileMapbox;

mapTileMapbox.token = 'your_token';

mapTileMapbox.styles = {
  'mapbox://styles/mapbox/streets-v11' : 'Street',
  'mapbox://styles/mapbox/outdoors-v11' : 'Outdoors',
  'mapbox://styles/mapbox/light-v10' : 'Light',
  'mapbox://styles/mapbox/dark-v10' : 'Dark',
  'mapbox://styles/mapbox/bright-v8' : 'Bright'
};

function setup () {
  setupMapboxLeaflet();


    for(var style in mapTileMapbox.styles) {
      let name = mapTileMapbox.styles[style];
      layerChooser.addBaseLayer(L.mapboxGL({
          accessToken: mapTileMapbox.token,
          style: style
        }), 'Mapbox ' + name);
    }
};

function setupMapboxLeaflet () {
  try {
    '@include_raw:external/mapbox-gl.js@';
    '@include_raw:external/leaflet-mapbox-gl.js@';
    $('<style>').html('@include_string:external/mapbox-gl.css@').appendTo('head');

  } catch (e) {
    console.error('mapbox-gl.js loading failed');
    throw e;
  }
}

