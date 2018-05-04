require('../meta/typedefs');

const { TaskConfigSchema } = require('../meta/schemas')
, { mergeObjects, Schedule } = require('sh.orchestration-tools')
, Joi = require('joi')
, { ResolvedConfig } = require('./ResolvedConfig');


/** @type {Object.<string, Function>} */
const _registeredSubclasses = {};

class Task {
  /**
   * 
   * @param {TaskConfig} config The configuration for the task.
   */
  constructor(config) {
    if (Object.prototype.toString.call(config.enabled) !== '[object Boolean]') {
      throw new Error(`The configuration's property 'enabled' must be a resolved boolean value.`);
    }
    if (!(config.schedule instanceof Schedule)) {
      throw new Error(`The configuration's property 'schedule' must be an instance of ${Schedule.name}.`);
    }

    this.configOrg = Object.freeze(mergeObjects({}, config));
    
    /** @param {ValidationResult.<any>} */
    const checkValResult = result => {
      if (result.error !== null) {
        throw new Error(`The given configuration is not valid: ${JSON.stringify(valResult.error.details)}`);
      }
    };

    const taskSchemaConf = Object.getOwnPropertyDescriptor(
      Task.prototype, 'schemaConf').get();
    let valResult = Joi.validate(this.configOrg, taskSchemaConf);
    checkValResult(valResult);

    // Now check if this is a derived class that also defines a (derived) schema for its config
    const isSubClass = Task !== Object.getPrototypeOf(this).constructor;
    if (isSubClass && this.schemaConf !== taskSchemaConf) {
      // Then we need to validate this subclass' schema as well:
      valResult = Joi.validate(this.configOrg, this.schemaConf);
      checkValResult(valResult);
    }
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
    const rConfig = new ResolvedConfig(this.configOrg);
    return await rConfig.resolveAll();
  };


  /**
   * @type {Object.<string, Function>}
   */
  static get registeredSubclasses() {
    return mergeObjects({}, _registeredSubclasses);
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
    if (_registeredSubclasses.hasOwnProperty(name) && !forceOverride) {
      throw new Error(`A class/constructor function with the name '${name}' is already registered and overriding is not allowed.`);
    }
    
    _registeredSubclasses[name] = ctorFunc;
  };

  /**
   * @param {String} name The name of the class or constructor function
   * @returns {Function}
   */
  static getClassForName(name) {
    if (!(_registeredSubclasses.hasOwnProperty(name))) {
      throw new Error(`The class or constructor function '${name}' is not registered.`);
    }
    return _registeredSubclasses[name];
  };

  /**
   * @param {TaskConfig} config The task's configuration
   * @returns {Task} An instance of the task using the designated class
   */
  static fromConfiguration(config) {
    let ctorFunc = null;

    if (config.type instanceof Function) {
      Task.registerSubclass(config.type, true);
      ctorFunc = config.type;
    } else {
      ctorFunc = Task.getClassForName(config.type);
    }
    
    return new ctorFunc(config);
  };
};


module.exports = Object.freeze({
  Task
});