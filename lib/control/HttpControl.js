require('../../meta/typedefs');

const { Control } = require('./Control')
, { Cameleer } = require('../cameleer/Cameleer')
, http = require('http');


/**
 * Supports controlling Cameleer using GET-requests of the form:
 * /control/command/<command>. Arguments may be supplied using
 * spaces.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class HttpControl extends Control {
  /**
   * @param {Cameleer} cameleerInstance 
   * @param {number} [port] Optional. Defaults to 80 
   */
  constructor(cameleerInstance, port = 80) {
    super(cameleerInstance);
    this.port = port;
    this.server = null;
    this.logScope = this.logger.beginScope(`${HttpControl.name} (${port})`);
    this.logger.logInfo(`Running Http-Controller for Cameleer on port ${port}.`);
    this._initServer();
  };

  _initServer() {
    const path = 'control/command/';
    this.server = http.createServer(async(req, res) => {
      const idx = req.url.indexOf(path);
      if (idx >= 0) {
        try {
          const line = req.url.substr(idx + path.length).split(' ');
          this.logger.logInfo(`Received command: '${line}'`);
          await this.processCommand.apply(this, line);
          res.statusCode = 200;
        } catch (e) {
          res.write(e);
          res.statusCode = 500;
          this.logger.logError(`500 caused by: ${e instanceof Error ? e.message : e}`);
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
    this.logger.endScope(this.logScope);
    this.logger.logInfo(`Shut down Http-Controller running on port ${this.port}.`);
    super.teardown();
  };
};


module.exports = Object.freeze({
  HttpControl
});
