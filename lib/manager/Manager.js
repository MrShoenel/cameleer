require('../../meta/typedefs');

const { Cameleer } = require('../cameleer/Cameleer')
, { ManagerConfigSchema } = require('../../meta/schemas')
, { ConfigurableClass } = require('../../tools/ConfigurableClass')
, { SubClassRegister } = require('../../tools/SubClassRegister');


/**
 * A Manager is an interface that provides stats and insights into a
 * Cameleer instance. It may also allow to control Cameleer. This is
 * a base-class for other contributed Managers. A Manager ought to be
 * used to create user interfaces for Cameleer. If only control is
 * required, it may be advisable to use an existing Control or to
 * implement an own type of Control.
 * A Manager is supposed to be self-sustained, it should provide its
 * own API and all the components it needs (e.g. a Manager that provides
 * a web-based dashboard shall set up and facilitate its own web-server).
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Manager extends ConfigurableClass {
  /**
   * @param {Cameleer} cameleerInstance 
   * @param {ManagerConfig} [managerConfig]
   */
  constructor(cameleerInstance, managerConfig = void 0) {
    super(cameleerInstance, managerConfig);
  };

  /**
   * @returns {ObjectSchema} The ManagerConfigSchema for validation
   */
  get schemaConf() {
    return ManagerConfigSchema;
  };
};


SubClassRegister.registerSubclass(Manager);

module.exports = Object.freeze({
  Manager
});
