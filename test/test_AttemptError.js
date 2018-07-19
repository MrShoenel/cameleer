require('../meta/typedefs');

const { assert, expect } = require('chai')
, { assertThrowsAsync } = require('sh.orchestration-tools')
, { AttemptError, ErrorTypesKeys } = require('../lib/cameleer/RunAttempt');


describe('AttemptError', function() {
  it('should throw if given invalid arguments', done => {
    assert.throws(() => {
      new AttemptError('foo');
    });

    done();
  });

  it('should provide ErrorTypes statically', done => {
    const et = AttemptError.ErrorTypes;

    assert.isTrue(et.hasOwnProperty('finalFail'));

    done();
  });

  it('should construct correctly when given partial arguments', done => {
    const firstKey = ErrorTypesKeys.values().next().value;

    const ae1 = new AttemptError(firstKey, 'msg', 'we');
    assert.strictEqual(ae1.message, 'msg');

    const ae2 = new AttemptError(firstKey, void 0, 'we');
    assert.strictEqual(ae2.message, 'we');

    const ae3 = new AttemptError(firstKey, void 0, new Error('foo'));
    assert.strictEqual(ae3.message, 'foo');

    const ae4 = new AttemptError(firstKey, void 0, 42);
    assert.strictEqual(ae4.message, '');
    assert.strictEqual(ae4.wrappedErr, 42);

    done();
  });
});