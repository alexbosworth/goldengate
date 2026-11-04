const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const asHex = buffer => buffer.toString('hex');
const {assign} = Object;
const {isBuffer} = Buffer;
const {keys} = Object;
const requestHeaders = {'content-type': 'application/json'};
const serviceMethod = 'POST';
const servicePath = (socket, ver, method) => `${socket}/${ver}/${method}/`;
const {stringify} = JSON;

module.exports = ({fetch, headers, method, parameters, socket, ver}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Post API call, a failure to post or to parse the response is thrown
      post: async () => {
        // Bytes cannot be serialized in JSON so convert them to hex
        keys(parameters)
          .filter(key => isBuffer(parameters[key]))
          .forEach(key => parameters[key] = asHex(parameters[key]));

        const res = await fetch(servicePath(socket, ver, method), {
          headers: assign(headers, requestHeaders),
          method: serviceMethod,
          body: stringify(parameters),
        });

        const json = await res.json();

        json.metadata = {get: () => json.authenticate};

        return {json, is_ok: res.ok};
      },

      // Parse out result from API call
      result: ['post', ({post}, cbk) => {
        // A failure response from the service is passed back as the error
        if (!post.is_ok) {
          return cbk(post.json);
        }

        return cbk(null, post.json);
      }],
    },
    returnResult({reject, resolve, of: 'result'}, cbk));
  });
};