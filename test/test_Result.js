require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync, timeout, mergeObjects, ManualSchedule } = require('sh.orchestration-tools')
, { Result, ErrorResult } = require('../lib/cameleer/Result');


describe('Result', function() {
  it('should be an erroneous Result, if instantiated with an Error', done => {
    const e = new Error('42');
    /** @type {Result.<ErrorResult>} */
    const r = Result.fromError(e);

    assert.isTrue(r.isError);
    assert.isTrue(r.value instanceof Error);
    assert.strictEqual(r.value, e);
    assert.strictEqual(r.error.error, e);

    assert.throws(() => {
      new Result(42, new Date());
    });

    done();
  });

  it('should create non-erroneous Results if not given an Error', done => {
    const r = Result.fromValue(42);
    assert.isFalse(r.isError);
    assert.strictEqual(r.value, 42);

    done();
  });
});
