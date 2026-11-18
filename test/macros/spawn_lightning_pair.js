const asyncRetry = require('async/retry');
const {authenticatedLndGrpc} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {getUtxos} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningDocker} = require('ln-docker-daemons');

const generateAddress = '2N8hwP1WmJrFF5QWABn38y63uYLhnJYJYTF';
const interval = 10;
const maturity = 100;
const size = 2;
const times = 3000;

// Mine blocks to a node, and wait for a coin when a coinbase output matures
const generate = async ({count, docker, lnd}) => {
  const {address} = await createChainAddress({lnd});

  await docker.generate({address, count});

  // Exit early when there are not enough blocks to mature a coinbase
  if (!count || count < maturity) {
    return;
  }

  return await asyncRetry({interval, times}, async () => {
    const {utxos} = await getUtxos({lnd});

    if (!utxos.length) {
      throw new Error('ExpectedUtxoForMaturedCoinbase');
    }
  });
};

// A node with the details of its Docker containers and an LND to use
const nodeFor = docker => {
  const {lnd} = authenticatedLndGrpc({
    cert: docker.cert,
    macaroon: docker.macaroon,
    socket: docker.socket,
  });

  return {
    docker,
    lnd,
    generate: ({count}) => generate({count, docker, lnd}),
    id: docker.public_key,
    socket: docker.ln_socket,
  };
};

/** Spawn two LNDs with their own chains, and a channel from the first one

  {
    capacity: <Channel Capacity Tokens Number>
  }

  @returns via Promise
  {
    kill: () => <Stop Nodes Promise>
    nodes: [{
      docker: <Spawned Lightning Docker Object>
      generate: ({count}) => <Mine Blocks Promise>
      id: <Node Public Key Hex String>
      lnd: <Authenticated LND API Object>
      socket: <LN P2P Socket String>
    }]
  }
*/
module.exports = async ({capacity}) => {
  const spawning = [...Array(size)].map(() => {
    return spawnLightningDocker({generate_address: generateAddress});
  });

  // Wait for both nodes to start, even when one fails to start
  const spawned = await Promise.allSettled(spawning);

  const failure = spawned.find(n => n.status === 'rejected');
  const started = spawned.filter(n => n.status === 'fulfilled');

  const dockers = started.map(n => n.value);

  const kill = () => Promise.all(dockers.map(docker => docker.kill({})));

  if (!!failure) {
    await kill();

    throw failure.reason;
  }

  const nodes = dockers.map(nodeFor);

  const [client, server] = nodes;

  try {
    // The chains of the nodes share their blocks
    await client.docker.add_chain_peer({socket: server.docker.chain_socket});

    await setupChannel({
      capacity,
      generate: client.generate,
      lnd: client.lnd,
      to: server,
    });
  } catch (err) {
    await kill();

    throw err;
  }

  return {kill, nodes};
};
