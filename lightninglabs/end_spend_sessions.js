const asyncEachSeries = require('async/eachSeries');
const {endGroupSigningSession} = require('ln-service');
const {returnResult} = require('asyncjs-util');

/** End the shared address MuSig2 sessions that are not ended yet

  {
    lnd: <Authenticated LND API Object>
    sessions: [{
      id: <Signing Session Id Hex String>
      [is_ended]: <Session Is Ended Bool>
    }]
  }

  @returns via cbk or Promise
*/
module.exports = ({lnd, sessions}, cbk) => {
  return new Promise((resolve, reject) => {
    const unfinished = sessions.filter(n => !n.is_ended);

    // A failure to clean up a session is not an error
    return asyncEachSeries(unfinished, ({id}, cbk) => {
      return endGroupSigningSession({id, lnd}, () => cbk());
    },
    returnResult({reject, resolve}, cbk));
  });
};
