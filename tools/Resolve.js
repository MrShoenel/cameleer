class Resolve {
  /**
   * Check whether or not a value is of a specific type, that can be given
   * as an example, an actual Type/Class or the name of a class.
   * 
   * @param {any} value the value to check
   * @param {any|string} exampleOrTypeOrClassName an examplary other value you'd
   * expect, a type (e.g. RegExp) or class or the name of a class or c'tor-function.
   * @returns {boolean}
   */
  static isTypeOf(value, exampleOrTypeOrClassName) {
    const tName = v => Object.prototype.toString.call(v);


    if (typeof exampleOrTypeOrClassName === 'string' && typeof value === 'string') {
      // Check if the given example was a string and the value as well:
      return true;
    } else { // The example is not a string
      try {
        if (value instanceof exampleOrTypeOrClassName) { // let's make a quick check first
          return true;
        }
      } catch (e) { }
      
      if (tName(value) === tName(exampleOrTypeOrClassName)) {
        // If the value is of the same evaluated type as the example (which is not a string)
        return true;
      }
    }


    try {
      const proto = Object.getPrototypeOf(value)
      , ctor = proto.hasOwnProperty('constructor') ? proto.constructor : null;

      if (typeof exampleOrTypeOrClassName === 'string') {
        if (ctor.name === exampleOrTypeOrClassName) {
          return true;
        }
      } else if (Resolve.isFunction(exampleOrTypeOrClassName)) {
        if (value instanceof exampleOrTypeOrClassName) {
          return true;
        } else if (ctor === exampleOrTypeOrClassName) {
          return true;
        }
      }
    } catch (e) { }


    return false;
  };

  /**
   * @param {any|Number} value 
   * @returns {boolean} true, iff the given number or NaN is of type Number
   */
  static isNumber(value) {
    return Object.prototype.toString.call(value) === '[object Number]';
  };

  /**
   * @param {any|Function|AsyncFunction} value
   * @returns {boolean} true, iff the given value is an (async) function
   */
  static isFunction(value) {
    return typeof value === 'function';
  };

  /**
   * @param {any|Promise} value
   * @returns {boolean} true, iff the value is an instance of Promise
   */
  static isPromise(value) {
    return Resolve.isTypeOf(value, Promise);
  };

  /**
   * Resolve a literal value, a function or Promise to a value. If enabled, deeply
   * resolves functions or Promises. Attempts to resolve (to a) value until it matches
   * the expected example, type/class or class name.
   * 
   * @see {Resolve.isTypeOf}
   * @template T
   * @param {any|T|(() => T)|Promise.<T>} value a literal value or an (async) function
   * or Promise that may produce a value of the expected type or exemplary value.
   * @param {any|string|T} exampleOrTypeOrClassName an examplary other value you'd
   * expect, a type (e.g. RegExp) or class or the name of a class or c'tor-function.
   * @param {boolean} resolveFuncs if true, then functions will be called and their
   * return value will be checked against the expected type or exemplary value. Note that
   * this parameter applies recursively, until a function's returned value no longer is a
   * function.
   * @param {boolean} resolvePromises if true, then Promises will be awaited and their
   * resolved value will be checked against the expected type or exemplary value. Note that
   * this parameter applies recursively, until a Promise's resolved value no longer is a
   * Promise.
   * @throws {Error} if the value cannot be resolved to the expected type or exemplary
   * value.
   * @returns {T} the resolved-to value
   */
  static async toValue(value, exampleOrTypeOrClassName, resolveFuncs = true, resolvePromises = true) {
    const checkType = val => Resolve.isTypeOf(val, exampleOrTypeOrClassName)
    , orgVal = value;

    if (checkType(value)) {
      return value;
    }

    do {
      let isFunc = false, isProm = false;

      if ((resolveFuncs && (isFunc = Resolve.isFunction(value)))
        || (resolvePromises && (isProm = Resolve.isPromise(value)))) {
        value = isFunc ? value() : await value;
        if (checkType(value)) {
          return value;
        } else {
          continue;
        }
      } else {
        break;
      }
    } while (true);

    throw new Error(`The value '${JSON.stringify(orgVal)}' cannot be resolved to
      '${exampleOrTypeOrClassName}' using resolveFuncs=${resolveFuncs}
      and resolvePromises=${resolvePromises}.`);
  };
};


module.exports = Object.freeze({
  Resolve
});