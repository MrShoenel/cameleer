require('../../meta/typedefs');

const { Control } = require('./Control')
, { Cameleer } = require('../Cameleer')
, http = require('http');


/**
 * Supports controlling Cameleer using GET-requests of the form:
 * /control/command/<command>. Arguments may be supplied using
 * spaces.
 */
class HttpControl extends Control {
  constructor(cameleerInstance, port = 80) {
    super(cameleerInstance);
    this.port = port;
    this.server = null;
    this._initStdin();
  };

  _initStdin() {
    const path = 'control/command/';
    this.server = http.createServer(async(req, res) => {
      const idx = req.url.indexOf(path);
      if (idx >= 0) {
        try {
          const line = req.url.substr(idx + path.length).split(' ');
          await this.processCommand.apply(this, line);
          res.statusCode = 200;
        } catch (e) {
          res.write(e);
          res.statusCode = 500;
        } finally {
          res.end();
        }
      }
    });

    this.server.listen(this.port);
  };

  async teardown() {
    this.server.removeAllListeners();
    this.server.close();
  };
};


module.exports = Object.freeze({
  HttpControl
});
