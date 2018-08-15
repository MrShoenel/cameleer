
/**
 * Creates a new value that can be observed. Whenever one of its properties
 * is set, the given callback is called.
 * 
 * @author Sebastian Hönel <development@hoenel.net>
 * 
 * @template T, TVal
 * @param {(target: T, prop: string, val: TVal, proxy: Proxy) => void} callback
 * Is called every time any of the target's properties is set. 
 * @param {T} [target] Optional. Defaults to a new, empty Object. Can be any value.
 * @returns {T} The given target value, proxied
 */
const createObservableValue = (callback, target = {}) => {
  return new Proxy(target, {
    set(target, prop, val, recv) {
      target[prop] = val;
      callback(...arguments);
      return true;
    }
  });
};


module.exports = Object.freeze({
  createObservableValue
});
