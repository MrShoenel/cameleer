require('../../meta/typedefs');

const Joi = require('joi')
, util = require('util')
, { TaskConfigSchema } = require('../../meta/schemas')
, { mergeObjects, Schedule } = require('sh.orchestration-tools')
, { ResolvedConfig } = require('./ResolvedConfig')
, { Result } = require('./Result')
, { BaseLogger } = require('sh.log-client');



/** @type {Map.<string, Function>} */
const _registeredSubclasses = new Map();



/**
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Task {
  /**
   * @param {TaskConfig} config The configuration for the task.
   * @param {CameleerDefaults} defaults The defaults for functional tasks.
   */
  constructor(config, defaults) {
    if (Object.prototype.toString.call(config.enabled) !== '[object Boolean]') {
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
  async resolveConfig(defaults) {
    const rConfig = new ResolvedConfig(this.config, this.defaults.tasks);
    return await rConfig.resolveAll();
  };


  /**
   * @type {Map.<string, Function>}
   */
  static get registeredSubclasses() {
    return new Map(_registeredSubclasses.entries());
  };

  /**
   * @param {Function} ctorFunc The constructor function that creates an instance of
   * a class that subclasses Task (or Task itself).
   * @param {boolean} forceOverride if a class/constructor function with the same name
   * has already been registered, this method will throw, unless this parameter is set
   * to true to allow explicit overriding of a previous registration.
   */
  static registerSubclass(ctorFunc, forceOverride = false) {
    if (!(ctorFunc instanceof Function)
      || (!ctorFunc.prototype instanceof Task)) {
      throw new Error(`The argument given for 'ctorFunc' is not a constructor Function for objects of type Task.`);
    }

    const name = ctorFunc.name;
    if (_registeredSubclasses.has(name) && !forceOverride) {
      throw new Error(`A class/constructor function with the name '${name}' is already registered and overriding is not allowed.`);
    }
    
    _registeredSubclasses.set(name, ctorFunc);
  };

  /**
   * Un-registers a previously registered (sub-)Class of Task by name or by Constructor
   * (pass in the class itself).
   * 
   * @param {Function|string} ctorFuncOrName
   * @returns {Function} the un-registered constructor-function.
   */
  static unregisterSubclass(ctorFuncOrName) {
    let name = null;
    if (typeof ctorFuncOrName === 'function') {
      if (ctorFuncOrName !== Task && !(ctorFuncOrName.prototype instanceof Task)) {
        throw new Error(`The given constructor function does not produce objects of type Task.`);
      }
      name = ctorFuncOrName.name;
    } else if (typeof ctorFuncOrName === 'string') {
      name = ctorFuncOrName;
    } else {
      throw new Error(`The argument given for 'ctorFuncOrName' must be of type Function or String.`);
    }

    if (!_registeredSubclasses.has(name)) {
      throw new Error(`The class/constructor function with the name '${name}' was not previously registered.`);
    }

    const ctorFunc = _registeredSubclasses.get(name);
    _registeredSubclasses.delete(name);
    return ctorFunc;
  }

  /**
   * @param {String} name The name of the class or constructor function
   * @returns {Function}
   */
  static getClassForName(name) {
    if (!_registeredSubclasses.has(name)) {
      throw new Error(`The class or constructor function '${name}' is not registered.`);
    }
    return _registeredSubclasses.get(name);
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
      Task.registerSubclass(config.type, true);
      ctorFunc = config.type;
    } else {
      ctorFunc = Task.getClassForName(config.type);
    }
    
    return new ctorFunc(config, defaults);
  };
};


module.exports = Object.freeze({
  Task
});