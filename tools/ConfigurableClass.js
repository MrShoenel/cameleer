require('../meta/typedefs');

const Joi = require('joi')
, { inspect } = require('util')
, { Cameleer } = require('../lib/cameleer/Cameleer')
, { ConfigurableClassConfigSchema } = require('../meta/schemas')
, { mergeObjects } = require('sh.orchestration-tools')
, { SubClassRegister } = require('./SubClassRegister');



/**
 * An abstract base-class where the intended use is interaction with Cameleer and optional
 * configuration supporting validation. Other types are supposed to sub-class this class
 * and to create instances using the inherited static method fromConfiguration(), as this
 * method takes care of registration, validation and proper instantiation.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 */
class ConfigurableClass {
  /**
   * @param {Cameleer} cameleerInstance
   * @param {ConfigurableClassConfig} [config] The configuration for the sub-class. It
   * is being validated using ConfigurableClassConfigSchema and the sub-class' derived
   * schema (if any).
   */
  constructor(cameleerInstance, config = void 0) {
    this.cameleer = cameleerInstance;
    this.config = mergeObjects({}, config || {});
    this.clazz = this.constructor;

    if (config !== void 0) {
      /** @param {ValidationResult.<any>} */
      const checkValResult = result => {
        if (result.error !== null) {
          throw new Error(`The given configuration is not valid: ${inspect(result.error)}`);
        }
      };

      // Make that the config if this instance conforms to the schema for
      // ConfigurableClass and also validate against its own schema.
      let valResult = Joi.validate(this.config, ConfigurableClassConfigSchema);
      checkValResult(valResult);
      valResult = Joi.validate(this.config, this.schemaConf);
      checkValResult(valResult);
    }

    this.logger = cameleerInstance.getLogger(this.clazz);
  };

  /**
   * Property that should return a schema to validate configurations against
   * that this class or its subclasses require. Should be overridden for sub-
   * classes that require specific properties in their configuration.
   * 
   * @returns {ObjectSchema}
   */
  get schemaConf() {
    return ConfigurableClassConfigSchema;
  };

  /**
   * Returns the concrete name of this Class. Works also for sub-classes.
   */
  get [Symbol.toStringTag]() {
    return this.clazz.name;
  };

  /**
   * Override and use this function for teardown logic as required by the
   * specific sub-class.
   */
  async teardown() {
  };

  /**
   * @param {Cameleer} cameleerInstance
   * @param {ConfigurableClassConfig} config The configuration for the sub-class.
   * @returns {ConfigurableClass} An instance of the sub-class using the designated class
   */
  static fromConfiguration(cameleerInstance, config) {
    let ctorFunc = null;

    if (ConfigurableClassConfigSchema.validate(config).error !== null) {
      throw new Error(`The given config is not valid.`);
    }

    if (config.type instanceof Function) {
      SubClassRegister.registerSubclass(config.type, true);
      ctorFunc = config.type;
    } else {
      // If we get here, the type must have been previously registered.
      ctorFunc = config.type === ConfigurableClass.name ?
        ConfigurableClass : SubClassRegister.getSubClassForName(ConfigurableClass, config.type);
    }
    
    return new ctorFunc(cameleerInstance, config);
  };
};

module.exports = Object.freeze({
  ConfigurableClass
});
