require('../../meta/typedefs');

const Joi = require('joi')
, { Control } = require('./Control')
, { Cameleer } = require('../cameleer/Cameleer')
, { ConfigurableClassConfigSchema } = require('../../meta/schemas')
, http = require('http');


const ControlHttpControlConfigSchema = ConfigurableClassConfigSchema.keys({
  port: Joi.number().integer().min(80).max(2**16 - 1).required()
});


/**
 * Supports controlling Cameleer using GET-requests of the form:
 * /control/command/<command>. Arguments may be supplied using
 * spaces.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class HttpControl extends Control {
  /**
   * @returns {number} The default Port (80).
   */
  static get defaultPort() {
    return 80;
  };

  /**
   * @param {Cameleer} cameleerInstance 
   * @param {ConfigurableClassConfig} config Requires the property 'port'.
   */
  constructor(cameleerInstance, config) {
    super(cameleerInstance, config);
    this.port = config.port;
    this.server = null;
    this.logScope = this.logger.beginScope(`${this.port}`);
    this.logger.logInfo(`Running Http-Controller for Cameleer on port ${this.port}.`);
    this._initServer();
  };

  /**
   * @returns {ObjectSchema}
   */
  get schemaConf() {
    return ControlHttpControlConfigSchema;
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


/**
 * @typedef ControlHttpControlConfig
 * @type {ConfigurableClassConfig}
 * @property {number} port
 */


module.exports = Object.freeze({
  HttpControl,
  ControlHttpControlConfigSchema
});
