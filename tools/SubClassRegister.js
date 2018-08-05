/** @type {Map.<Function, Map.<string, Function>>} */
const _registeredSubclasses = new Map();


/**
 * @throws {Error} If the given BaseClass is not a class
 * @param {Function} BaseClass The Base-Class to register sub-classes for.
 */
const requireIsClassAndRegistered = BaseClass => {
  if (!(BaseClass instanceof Function)) {
    throw new Error(`The given BaseClass is not a class or constructor function.`);
  }
  if (!_registeredSubclasses.has(BaseClass)) {
    _registeredSubclasses.set(BaseClass, new Map());
  }
};


/**
 * A class with static methods to register sub-classes of known types.
 */
class SubClassRegister {
  /**
   * @param {Function} BaseClass
   * @type {Map.<string, Function>}
   */
  static getRegisteredSubclasses(BaseClass) {
    requireIsClassAndRegistered(BaseClass);
    return new Map(_registeredSubclasses.get(BaseClass).entries());
  };

  /**
   * @param {Function} BaseClass
   * @param {Function} ctorFunc The constructor function that creates an instance of
   * a class that subclasses the BaseClass (or the BaseClass itself).
   * @param {boolean} forceOverride if a class/constructor function with the same name
   * has already been registered, this method will throw, unless this parameter is set
   * to true to allow explicit overriding of a previous registration.
   */
  static registerSubclass(BaseClass, ctorFunc, forceOverride = false) {
    requireIsClassAndRegistered(BaseClass);
    if (typeof ctorFunc !== 'function' || (ctorFunc !== BaseClass && !(ctorFunc.prototype instanceof BaseClass))) {
      throw new Error(`The argument given for 'ctorFunc' is not a constructor Function for objects of type ${BaseClass.name}.`);
    }

    const name = ctorFunc.name;
    if (_registeredSubclasses.get(BaseClass).has(name) && !forceOverride) {
      throw new Error(`A class/constructor function with the name '${name}' is already registered and overriding is not allowed.`);
    }
    
    _registeredSubclasses.get(BaseClass).set(name, ctorFunc);
  };

  /**
   * Un-registers a previously registered (sub-)Class of the BaseClass by name or by Constructor
   * (pass in the class itself).
   * 
   * @param {Function} BaseClass
   * @param {Function|string} ctorFuncOrName
   * @returns {Function} the un-registered constructor-function.
   */
  static unregisterSubclass(BaseClass, ctorFuncOrName) {
    requireIsClassAndRegistered(BaseClass);
    let name = null;
    if (typeof ctorFuncOrName === 'function') {
      if (ctorFuncOrName !== BaseClass && !(ctorFuncOrName.prototype instanceof BaseClass)) {
        throw new Error(`The given constructor function does not produce objects of type ${BaseClass.name}.`);
      }
      name = ctorFuncOrName.name;
    } else if (typeof ctorFuncOrName === 'string') {
      name = ctorFuncOrName;
    } else {
      throw new Error(`The argument given for 'ctorFuncOrName' must be of type Function or String.`);
    }

    if (!_registeredSubclasses.get(BaseClass).has(name)) {
      throw new Error(`The class/constructor function with the name '${name}' was not previously registered.`);
    }

    const ctorFunc = _registeredSubclasses.get(BaseClass).get(name);
    _registeredSubclasses.get(BaseClass).delete(name);
    return ctorFunc;
  }

  /**
   * @param {Function} BaseClass
   * @param {String} name The name of the class or constructor function
   * @returns {Function}
   */
  static getClassForName(BaseClass, name) {
    requireIsClassAndRegistered(BaseClass);
    if (!_registeredSubclasses.get(BaseClass).has(name)) {
      throw new Error(`The class or constructor function '${name}' is not registered.`);
    }
    return _registeredSubclasses.get(BaseClass).get(name);
  };
};


module.exports = Object.freeze({
  SubClassRegister
});
