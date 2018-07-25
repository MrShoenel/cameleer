require('../../meta/typedefs');

const Joi = require('joi')
, util = require('util')
, { TaskConfigSchema } = require('../../meta/schemas')
, { mergeObjects, Schedule, Resolve } = require('sh.orchestration-tools')
, { ResolvedConfig } = require('./ResolvedConfig')
, { Result } = require('./Result')
, { BaseLogger } = require('sh.log-client')
, { SubClassRegister } = require('../../tools/SubClassRegister')



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Task {
  /**
   * @param {TaskConfig} config The configuration for the task.
   * @param {CameleerDefaults} defaults The defaults for functional tasks.
   */
  constructor(config, defaults) {
    if (!Resolve.isTypeOf(config.enabled, Boolean)) {
      throw new Error(`The configuration's property 'enabled' must be a resolved boolean value.`);
    }
    if (!(config.schedule instanceof Schedule)) {
      throw new Error(`The configuration's property 'schedule' must be an instance of ${Schedule.name}.`);
    }

    /** @type {TaskConfig} */
    this.config = Object.freeze(mergeObjects({}, config));
    this.defaults = Object.freeze(mergeObjects({}, defaults));
    this.name = this.config.name;
    
    /** @param {ValidationResult.<any>} */
    const checkValResult = result => {
      if (result.error !== null) {
        throw new Error(`The given configuration is not valid: ${util.inspect(result.error)}`);
      }
    };

    const taskSchemaConf = Object.getOwnPropertyDescriptor(
      Task.prototype, 'schemaConf').get();
    let valResult = Joi.validate(this.config, taskSchemaConf);
    checkValResult(valResult);

    // Now check if this is a derived class that also defines a (derived) schema for its config
    const isSubClass = Task !== Object.getPrototypeOf(this).constructor;
    if (isSubClass && this.schemaConf !== taskSchemaConf) {
      // Then we need to validate this subclass' schema as well:
      valResult = Joi.validate(this.config, this.schemaConf);
      checkValResult(valResult);
    }

    /** @type {BaseLogger.<any>} */
    this._logger = null;
  };

  /**
   * @param {BaseLogger.<any>} value
   */
  set logger(value) {
    if (this._logger !== null || !(value instanceof BaseLogger)) {
      throw new Error('This Task already has a logger or the value given is not a logger.');
    }
    this._logger = value;
  };

  /**
   * @returns {BaseLogger.<T>}
   */
  get logger() {
    if (!(this._logger instanceof BaseLogger)) {
      throw new Error('No logger has been set yet.');
    }
    return this._logger;
  };

  /**
   * @returns {boolean} true, if the task has the optional 'cost'-property.
   */
  get hasCost() {
    return this.config.hasOwnProperty('cost') && isFinite(this.config.cost);
  };

  /**
   * Property that should return a schema to validate configurations against
   * that this class or its subclasses require.
   * 
   * @returns {ObjectSchema}
   */
  get schemaConf() {
    return TaskConfigSchema;
  };

  /**
   * @returns {ResolvedConfig}
   */
  async resolveConfig() {
    const rConfig = new ResolvedConfig(this.config, this.defaults.tasks);
    return await rConfig.resolveAll();
  };

  /**
   * @param {FunctionalTaskConfig} functionalTask 
   * @returns {FunctionalTaskErrorConfig}
   */
  async resolveErrorConfig(functionalTask) {
    const rConfig = new ResolvedConfig(this.config, this.defaults.tasks);
    return await rConfig.resolveErrorConfig(functionalTask);
  };

  get [Symbol.toStringTag]() {
    return this.constructor.name;
  };

  /**
   * @param {TaskConfig} config The task's configuration
   * @param {CameleerDefaults} defaults
   * @returns {Task} An instance of the task using the designated class
   */
  static fromConfiguration(config, defaults) {
    let ctorFunc = null;

    if (!config.hasOwnProperty('type')) {
      config.type = Task;
    }

    if (config.type instanceof Function) {
      SubClassRegister.registerSubclass(Task, config.type, true);
      ctorFunc = config.type;
    } else {
      ctorFunc = config.type === Task.name ?
        Task : SubClassRegister.getClassForName(Task, config.type);
    }
    
    return new ctorFunc(config, defaults);
  };
};


module.exports = Object.freeze({
  Task
});