// @author         jaiperdu
// @name           Black intel style
// @category       Apparence
// @version        0.1.0
// @description    Black style for intel + some fix


// use own namespace for plugin
plugin.styleBlack = {}

var setup = function() {
	$('<style>').prop('type', 'text/css').html('@include_string:style-black.css@').appendTo('head');
}
