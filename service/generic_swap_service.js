const EventEmitter = require('events');

const callService = require('./call_service');
const {methods} = require('./generic_methods')
const {streams} = require('./streaming_methods');

const authHeader = 'authorization';
const ver = 'v0';

/** Generic swap service

  For fetch, pass a function like 'node-fetch' that returns a URL

  {
    fetch: <Fetch Function>
    socket: <Custom Socket String>
  }

  @throws
  <Error>

  @returns
  {
    service: <Swap Service API Object>
  }
*/
module.exports = ({fetch, socket}) => {
  if (!fetch) {
    throw new Error('ExpectedFetchFunctionForGenericSwapService');
  }

  if (!socket) {
    throw new Error('ExpectedRemoteSocketForGenericSwapService');
  }

  const unsupportedStreams = streams.reduce((sum, method) => {
    sum[method] = () => new EventEmitter();

    return sum;
  },
  {});

  const service = methods.reduce((sum, method) => {
    sum[method] = (parameters, metadata, cbk) => {
      const [authorization] = metadata.get(authHeader);

      const headers = {authorization};

      return callService({
        fetch,
        headers,
        method,
        parameters,
        socket,
        ver,
      },
      cbk);
    };

    return sum;
  },
  unsupportedStreams);

  return {service};
};
