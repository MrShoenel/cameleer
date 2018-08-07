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
    const RootBaseClazz = SubClassRegister.getRootBaseClassOf(BaseClass);
    return new Map(_registeredSubclasses.get(RootBaseClazz).entries());
  };

  /**
   * Register a Sub-class.
   * 
   * @param {Function} Clazz The class to register. The root base-class will be deter-
   * mined automatically, so that it's placed into the correct root.
   * @param {boolean} forceOverride if a class/constructor function with the same name
   * has already been registered, this method will throw, unless this parameter is set
   * to true to allow explicit overriding of a previous registration.
   */
  static registerSubclass(Clazz, forceOverride = false) {
    if (typeof Clazz !== 'function') {
      throw new Error('The given class is not a constructor function.');
    }

    const RootBaseClazz = SubClassRegister.getRootBaseClassOf(Clazz);
    if (RootBaseClazz === Clazz) {
      if (_registeredSubclasses.has(RootBaseClazz) && !forceOverride) {
        throw new Error(`The root base-class '${RootBaseClazz.name}' is already registered.`);        
      }
      requireIsClassAndRegistered(RootBaseClazz);
      return;
    }

    requireIsClassAndRegistered(RootBaseClazz);

    const name = SubClassRegister._getFQClazzName(Clazz);
    if (_registeredSubclasses.get(RootBaseClazz).has(name) && !forceOverride) {
      throw new Error(`A class/constructor function is already registered and overriding is not allowed.`);
    }

    _registeredSubclasses.get(RootBaseClazz).set(name, Clazz);
  };

  /**
   * Un-registers a previously registered (sub-)Class.
   * 
   * @param {Function} Clazz The sub-class to un-register.
   * @returns {Function} The un-registered sub-class.
   */
  static unregisterSubclass(Clazz) {
    if (typeof Clazz !== 'function') {
      throw new Error('The given class is not a constructor function.');
    }

    const checkRoot = RootBaseClazz => {
      if (!_registeredSubclasses.has(RootBaseClazz)) {
        throw new Error(`The root base-class '${RootBaseClazz.name}' is not known.`);
      }
    };

    const RootBaseClazz = SubClassRegister.getRootBaseClassOf(Clazz);
    if (RootBaseClazz === Clazz) {
      checkRoot(RootBaseClazz);
      _registeredSubclasses.delete(RootBaseClazz);
      return Clazz;
    }
    
    checkRoot(RootBaseClazz);

    if (RootBaseClazz === Clazz) {
      _registeredSubclasses.delete(RootBaseClazz);
      return;
    }

    const name = SubClassRegister._getFQClazzName(Clazz);
    if (!_registeredSubclasses.get(RootBaseClazz).has(name)) {
      throw new Error(`The class '${Clazz.name}' is not registered as sub-class of '${RootBaseClazz.name}'.`);
    }
    _registeredSubclasses.get(RootBaseClazz).delete(name);

    return Clazz;
  };

  /**
   * @param {Function} BaseClazz
   * @param {string} name
   */
  static getSubClassForName(BaseClazz, name) {
    const RootBaseClazz = SubClassRegister.getRootBaseClassOf(BaseClazz);
    
    requireIsClassAndRegistered(RootBaseClazz);

    for (let Clazz of _registeredSubclasses.get(RootBaseClazz).values()) {
      if (Clazz.name === name) {
        return Clazz;
      }
    }

    throw new Error(`The class with the name '${name}' could not be found as a sub-class of '${BaseClazz.name}'/'${RootBaseClazz.name}'.`);
  }

  /**
   * @param {Function} Clazz A class to get super-classes of.
   * @param {boolean} skipFuncAndObject Optional. Defaults to true. If
   * true, will skip the super-classes Function and Object.
   * @returns {IterableIterator.<Function>} An iterator with all of the
   * given class' super-classes, ordered. The last class returned is the
   * root base-class.
   */
  static *getSubClassesOf(Clazz, skipFuncAndObject = true) {
    let proto = Object.getPrototypeOf(Clazz);

    do {
      if (proto === null || (proto.prototype === void 0 && skipFuncAndObject)) {
        break; // Otherwise it will go down to Function and Object
      }

      yield proto;

      proto = Object.getPrototypeOf(proto);
    } while (proto !== null);
  };

  /**
   * @param {Function} Clazz A class to get the root base-class of. If
   * this class is already the root base-class, it is returned.
   * @returns {Function}
   */
  static getRootBaseClassOf(Clazz) {
    const baseClasses = [...SubClassRegister.getSubClassesOf(Clazz, true)];
    if (baseClasses.length === 0) {
      return Clazz;
    }
    return baseClasses.pop();
  };

  /**
   * @param {Function} Clazz A class to build the name based on its inheritance-
   * tree foo.
   * @returns {string} In the form 'A-B-C' where C is the given Class and A and
   * B are its super-classes.
   */
  static _getFQClazzName(Clazz) {
    const baseClasses = [...SubClassRegister.getSubClassesOf(Clazz)].map(clazz => clazz.name).reverse().join('-');
    return `${baseClasses}${baseClasses.length === 0 ? '' : '-'}${Clazz.name}`;
  };
};


module.exports = Object.freeze({
  SubClassRegister
});
