// @author         jaiperdu
// @name           Authentication test
// @category       Misc
// @version        0.1.0
// @description    Simple authentication test


// use own namespace for plugin
window.plugin.authTest = function() {};

window.plugin.authTest.dialogHTML = null;

// web app client id with auth screen allowing https://intel.ingress.com as origin
window.plugin.authTest.CLIENT_ID = '399825269956-mof3j81s694gnosta48i1kfvortfjb0l.apps.googleusercontent.com';

window.plugin.authTest.SCOPES = 'openid profile email';
window.plugin.authTest.TYPE = 'id_token permission';

window.plugin.authTest.authorize = function() {
  const options = {
    prompt: 'select_account', // or 'consent'
    client_id: this.CLIENT_ID,
    scope: this.SCOPES,
    response_type: this.TYPE
  };

  window.gapi.auth2.authorize(options, response => {
    if (response.error) {
      const err = `error: ${response.error}: ${response.error_subtype}`;
      alert(err);
      console.log(err);
      return;
    }

    alert(response.access_token);
    console.log(response.id_token, response.access_token);
  });
};

window.plugin.authTest.oneTap = function() {
  google.accounts.id.initialize({
    client_id: this.CLIENT_ID,
    callback: (response) => alert(JSON.stringify(response))
  });
  google.accounts.id.prompt(
    (n) => console.log(n)
    );
};

window.plugin.authTest.setupDialog = function() {
  $('#toolbox').append('<a id="authTest-authorize" onclick="window.plugin.authTest.authorize();">AuthTest</a> ');
  $('#toolbox').append('<a id="authTest-authorize" onclick="window.plugin.authTest.oneTap();">AuthOneTap</a> ');
};

var setup = function() {
  if (typeof window.gapi !== "undefined") {
    window.gapi.load("auth2", () => {
      window.gapi.auth2.enableDebugLogs(true);
    });
  }
  else {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.src = "https://apis.google.com/js/platform.js";
    script.onload = () => {
      window.gapi.load("auth2", () => {
        window.gapi.auth2.enableDebugLogs(true);
      });
    };
    (document.body || document.head || document.documentElement).appendChild(
      script
    );
  }

  window.plugin.authTest.setupDialog();
};

