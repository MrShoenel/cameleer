/**
 * This class can hold any kind of error (even undefined). That is why,
 * in case of a caught error, it is wrapped into this class, which is
 * then passed as error to LastFunctionArg's constructor. This class
 * then can safely determine whether there was an error or not, regard-
 * less of its kind.
 * 
 * @template T the error may be of any kind.
 * @author Sebastian Hönel <development@hoenel.net>
 */
class ErrorArg {
  constructor(error) {
    this.error = error;
  };
};


/**
 * @template T
 * @author Sebastian Hönel <development@hoenel.net>
 */
class LastFunctionArg {
  /**
   * @param {T} value To use for this argument. If this argument represents an
   * error, you shall use the error as value and also pass in an instance of
   * ErrorArg holding the error.
   * @param {ErrorArg} error an instance of the ErrorArg class if this argument
   * is to represent an error; undefined, otherwise.
   */
  constructor(value, error = void 0) {
    this.value = value;
    this.error = error;
  };

  get isError() {
    return this.error instanceof ErrorArg;
  };

  /**
   * Create a LastFunctionArg from a value (not an error).
   * 
   * @param {T} value 
   */
  static fromValue(value) {
    return new LastFunctionArg(value);
  };

  /**
   * Create a LastFunctionArg from an error of any kind. The value will become
   * the error and an additional ErrorArg is constructed from the error and
   * passed in as well.
   * 
   * @param {TError} error An error of any kind (i.e. something that was caught
   * in a try-catch block).
   */
  static fromError(error) {
    return new LastFunctionArg(error, new ErrorArg(error));
  };
};


module.exports = Object.freeze({
  ErrorArg,
  LastFunctionArg
});