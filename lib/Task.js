require('../meta/typedefs');

const { TaskConfigSchema } = require('../meta/schemas')
, Joi = require('joi');


/** @type {Object.<string, Function>} */
const _registeredSubclasses = {};

class Task {
  /**
   * 
   * @param {TaskConfig} config The configuration for the task.
   */
  constructor(config) {
    this.config = config;
  };


  /**
   * @type {Object.<string, Function>}
   */
  static get _registeredSubclasses() {
    return _registeredSubclasses;
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
    if (Task._registeredSubclasses.hasOwnProperty(name) && !forceOverride) {
      throw new Error(`A class/constructor function with the name '${name}' is already registered and overriding is not allowed.`);
    }

    Task._registeredSubclasses[name] = ctorFunc;
  };

  /**
   * @param {String} name The name of the class or constructor function
   * @returns {Function}
   */
  static getClassForName(name) {
    if (!(Task._registeredSubclasses.hasOwnProperty(name))) {
      throw new Error(`The class or constructor function '${name}' is not registered.`);
    }
    return Task._registeredSubclasses[name];
  };

  /**
   * @param {TaskConfig} config The task's configuration
   * @returns {Task} An instance of the task using the designated class
   */
  static fromConfiguration(config) {
    /** @param {ValidationResult.<any>} */
    const checkValResult = result => {
      if (result.error !== null) {
        throw new Error(`The given configuration is not valid: ${JSON.stringify(valResult.error.details)}`);
      }
    }

    let valResult = Joi.validate(config, Task.schemaConf);
    checkValResult(valResult);

    const ctorFuncName = typeof config.type === 'function' ? config.type.name : config.type;
    const ctorFunc = Task.getClassForName(ctorFuncName);

    valResult = Joi.validate(config, ctorFunc.schemaConf);
    checkValResult(valResult);

    return new ctorFunc(config);
  };

  /**
   * Static property that should return a schema to validate configurations against
   * that this class or its subclasses require.
   * 
   * @returns {ObjectSchema}
   */
  static get schemaConf() {
    return TaskConfigSchema;
  };
};


module.exports = Object.freeze({
  Task
});