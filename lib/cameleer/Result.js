/**
 * This class can hold any kind of error (even undefined). That is why,
 * in case of a caught error, it is wrapped into this class, which is
 * then passed as error to Result's constructor. This class then can
 * safely determine whether there was an error or not, regardless of
 * its kind.
 * 
 * @template T the error may be of any kind.
 * @author Sebastian Hönel <development@hoenel.net>
 */
class ErrorResult {
  constructor(error) {
    this.error = error;
  };
};


/**
 * @template T
 * @author Sebastian Hönel <development@hoenel.net>
 */
class Result {
  /**
   * @param {T} value To use for this argument. If this argument represents an
   * error, you shall use the error as value and also pass in an instance of
   * ErrorResult holding the error.
   * @param {ErrorResult} error an instance of the ErrorResult class if this argument
   * is to represent an error; undefined, otherwise.
   */
  constructor(value, error = void 0) {
    if (error !== void 0 && !(error instanceof ErrorResult)) {
      throw new Error('An error was given but is of wrong type.');
    }
    this.value = value;
    this.error = error;
  };

  get isError() {
    return this.error instanceof ErrorResult;
  };

  /**
   * Create a Result from a value (not an error).
   * 
   * @param {T} value 
   */
  static fromValue(value) {
    return new Result(value);
  };

  /**
   * Create a Result from an error of any kind. The value will become the
   * error and an additional ErrorResult is constructed from the error and
   * passed in as well.
   * 
   * @param {TError} error An error of any kind (i.e. something that was caught
   * in a try-catch block).
   */
  static fromError(error) {
    return new Result(error, new ErrorResult(error));
  };
};


module.exports = Object.freeze({
  Result,
  ErrorResult
});