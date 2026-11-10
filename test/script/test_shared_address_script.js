const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {controlBlock} = require('p2tr');

const method = require('./../../script/shared_address_script');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const leafVersion = key => key.startsWith('03') ? 'c1' : 'c0';
const serverKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

// Vectors derived apart from this code with BIP 327, BIP 341 and BIP 350
const vectors = [
  {
    description: 'Shared address for a CSV expiry pushed as a number',
    client_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    expiry: 14400,
    server_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    addresses: {
      btc: 'bc1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2js2papaf',
      btcregtest: 'bcrt1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2jssspgju',
      btcsignet: 'tb1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2jsaftw8x',
      btctestnet: 'tb1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2jsaftw8x',
    },
    external_key: '0296b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a5',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a5',
    root_hash: '5bc1cdd4838bb5c550556c932c1eb60628ec0de1466f8d7b738fd9b73536a5e6',
    timeout_script: '201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b2',
  },
  {
    description: 'Swapped key roles change the leaf but not the internal key',
    client_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    expiry: 14400,
    server_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    addresses: {
      btc: 'bc1pu8g5k5vm8tdjfy3wrvthdyyms9te2sqc0nmxmwus0g4fn5rulqyszwl9jz',
      btcregtest: 'bcrt1pu8g5k5vm8tdjfy3wrvthdyyms9te2sqc0nmxmwus0g4fn5rulqysclrvah',
      btcsignet: 'tb1pu8g5k5vm8tdjfy3wrvthdyyms9te2sqc0nmxmwus0g4fn5rulqys4xf2gd',
      btctestnet: 'tb1pu8g5k5vm8tdjfy3wrvthdyyms9te2sqc0nmxmwus0g4fn5rulqys4xf2gd',
    },
    external_key: '02e1d14b519b3adb24922e1b1776909b81579540187cf66dbb907a2a99d07cf809',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '5120e1d14b519b3adb24922e1b1776909b81579540187cf66dbb907a2a99d07cf809',
    root_hash: 'c6ca0f9d78acf658338a2b6606c89ba90c478cea7b30eb2ebd4f03495c136cec',
    timeout_script: '204d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ad024038b2',
  },
  {
    description: 'Shared address for a small integer op code CSV expiry',
    client_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    expiry: 10,
    server_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    addresses: {
      btc: 'bc1p6s6k58n5pvprcg5kstg33vre7drxsz3p0x9vqyn2f006s0tkz7wsltnk70',
      btcregtest: 'bcrt1p6s6k58n5pvprcg5kstg33vre7drxsz3p0x9vqyn2f006s0tkz7ws960l36',
      btcsignet: 'tb1p6s6k58n5pvprcg5kstg33vre7drxsz3p0x9vqyn2f006s0tkz7wsgr9eyq',
      btctestnet: 'tb1p6s6k58n5pvprcg5kstg33vre7drxsz3p0x9vqyn2f006s0tkz7wsgr9eyq',
    },
    external_key: '03d4356a1e740b023c229682d118b079f346680a21798ac0126a4bdfa83d76179d',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '5120d4356a1e740b023c229682d118b079f346680a21798ac0126a4bdfa83d76179d',
    root_hash: 'eb66d698b6bd55e7361c3f545053111037692cc91c7ec9001be75cc023963923',
    timeout_script: '201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad5ab2',
  },
  {
    description: 'Shared address for the maximum CSV expiry',
    client_public_key: '02531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337',
    expiry: 65535,
    server_public_key: '03462779ad4aad39514614751a71085f2f10e1c7a593e4e030efb5b8721ce55b0b',
    addresses: {
      btc: 'bc1pp4e759pt0td6vwym434jv8hxn05g26fmfu7d8zx5nr3jx0sn6n4qs25ecj',
      btcregtest: 'bcrt1pp4e759pt0td6vwym434jv8hxn05g26fmfu7d8zx5nr3jx0sn6n4q2mgsh8',
      btcsignet: 'tb1pp4e759pt0td6vwym434jv8hxn05g26fmfu7d8zx5nr3jx0sn6n4q8zzkza',
      btctestnet: 'tb1pp4e759pt0td6vwym434jv8hxn05g26fmfu7d8zx5nr3jx0sn6n4q8zzkza',
    },
    external_key: '030d73ea142b7adba6389bac6b261ee69be885693b4f3cd388d498e3233e13d4ea',
    internal_key: 'b6968afcd8cca764d730f334c0b1652ee6d8cc090d400157a94f68966792a2e3',
    output_script: '51200d73ea142b7adba6389bac6b261ee69be885693b4f3cd388d498e3233e13d4ea',
    root_hash: 'fbdfc05eb4fdb84a2fdd9360d572ed2b800d6733a8b3392ca7d492f1f7287d80',
    timeout_script: '20531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337ad03ffff00b2',
  },
  {
    description: 'Shared address for a CSV expiry with a sign padding byte',
    client_public_key: '0362c0a046dacce86ddd0343c6d3c7c79c2208ba0d9c9cf24a6d046d21d21f90f7',
    expiry: 144,
    server_public_key: '03f006a18d5653c4edf5391ff23a61f03ff83d237e880ee61187fa9f379a028e0a',
    addresses: {
      btc: 'bc1p244ph82mzt2suu3rydrka3erqs7uweh7rmkpfhd0wh94r20z229q03782p',
      btcregtest: 'bcrt1p244ph82mzt2suu3rydrka3erqs7uweh7rmkpfhd0wh94r20z229q4qzw95',
      btcsignet: 'tb1p244ph82mzt2suu3rydrka3erqs7uweh7rmkpfhd0wh94r20z229qceggsw',
      btctestnet: 'tb1p244ph82mzt2suu3rydrka3erqs7uweh7rmkpfhd0wh94r20z229qceggsw',
    },
    external_key: '02556a1b9d5b12d50e722323476ec723043dc766fe1eec14ddaf75cb51a9e2528a',
    internal_key: 'd8ddc1c8197fb4e279c1d8ee1bfd9c46b1f383cdf87a6f3019a94447fec809f5',
    output_script: '5120556a1b9d5b12d50e722323476ec723043dc766fe1eec14ddaf75cb51a9e2528a',
    root_hash: '8a65beb50dd013ce6c3ced41baa30891da4a320ecb7691dad70f7315f9afd44b',
    timeout_script: '2062c0a046dacce86ddd0343c6d3c7c79c2208ba0d9c9cf24a6d046d21d21f90f7ad029000b2',
  },
  {
    description: 'Shared address for a one block CSV expiry op code',
    client_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    expiry: 1,
    server_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    addresses: {
      btc: 'bc1pyljp76a9p6vkj50ch6sycd0dhrg9xvdz6kl2pppgnv5wr7y87qvq978w9u',
      btcregtest: 'bcrt1pyljp76a9p6vkj50ch6sycd0dhrg9xvdz6kl2pppgnv5wr7y87qvql0m82f',
      btcsignet: 'tb1pyljp76a9p6vkj50ch6sycd0dhrg9xvdz6kl2pppgnv5wr7y87qvqjk3pln',
      btctestnet: 'tb1pyljp76a9p6vkj50ch6sycd0dhrg9xvdz6kl2pppgnv5wr7y87qvqjk3pln',
    },
    external_key: '0227e41f6ba50e996951f8bea04c35edb8d05331a2d5bea084289b28e1f887f018',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '512027e41f6ba50e996951f8bea04c35edb8d05331a2d5bea084289b28e1f887f018',
    root_hash: '36a25db053af2940aaefca066c12f89cab34fe8aab5a87be219bd334575425e7',
    timeout_script: '201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad51b2',
  },
  {
    description: 'Shared address for the largest op code CSV expiry',
    client_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    expiry: 16,
    server_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    addresses: {
      btc: 'bc1pru6knk9xagstgke0296a8nk0dezr2s3e7qg0pfgfztkew5408zhqps8kcm',
      btcregtest: 'bcrt1pru6knk9xagstgke0296a8nk0dezr2s3e7qg0pfgfztkew5408zhqmpmlhw',
      btcsignet: 'tb1pru6knk9xagstgke0296a8nk0dezr2s3e7qg0pfgfztkew5408zhqkc3ez5',
      btctestnet: 'tb1pru6knk9xagstgke0296a8nk0dezr2s3e7qg0pfgfztkew5408zhqkc3ez5',
    },
    external_key: '021f3569d8a6ea20b45b2f5175d3cecf6e44354239f010f0a50912ed9752af38ae',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '51201f3569d8a6ea20b45b2f5175d3cecf6e44354239f010f0a50912ed9752af38ae',
    root_hash: 'aecf9b80b2f13e1f768b64a7efca694be323e7cac92036c9d46bacb5385fcf82',
    timeout_script: '201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad60b2',
  },
  {
    description: 'Shared address for the smallest CSV expiry number push',
    client_public_key: '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
    expiry: 17,
    server_public_key: '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
    addresses: {
      btc: 'bc1pn79ephzlwmt94uq7yu34r0zsfhdec5al7rnruwreqevwu2zqstqsvkcsc8',
      btcregtest: 'bcrt1pn79ephzlwmt94uq7yu34r0zsfhdec5al7rnruwreqevwu2zqstqsk8yehj',
      btcsignet: 'tb1pn79ephzlwmt94uq7yu34r0zsfhdec5al7rnruwreqevwu2zqstqsm7wlzg',
      btctestnet: 'tb1pn79ephzlwmt94uq7yu34r0zsfhdec5al7rnruwreqevwu2zqstqsm7wlzg',
    },
    external_key: '029f8b90dc5f76d65af01e272351bc504ddb9c53bff0e63e38790658ee284082c1',
    internal_key: '99a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    output_script: '51209f8b90dc5f76d65af01e272351bc504ddb9c53bff0e63e38790658ee284082c1',
    root_hash: 'f19fd8e38a3b5f9b51f1928add9fd0a8838285802650aadbddcb3cf294d9d801',
    timeout_script: '201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad0111b2',
  },
];

// The output key parity is in the low bit of the control block leaf version
const expectedFor = ({network, vector}) => ({
  address: vector.addresses[network],
  control_block: leafVersion(vector.external_key) + vector.internal_key,
  external_key: vector.external_key,
  internal_key: vector.internal_key,
  output_script: vector.output_script,
  root_hash: vector.root_hash,
  script_branches: [{script: vector.timeout_script}],
  timeout_script: vector.timeout_script,
});

// Make a test case for a vector on each network
const casesFor = vector => Object.keys(vector.addresses).map(network => ({
  args: {
    network,
    client_public_key: vector.client_public_key,
    expiry: vector.expiry,
    server_public_key: vector.server_public_key,
  },
  description: `${vector.description} on ${network}`,
  expected: expectedFor({network, vector}),
}));

// Get a shared address with the control block to spend its timeout path
const sharedAddressFor = args => {
  const address = method(args);

  const {block} = controlBlock({
    external_key: address.external_key,
    internal_key: address.internal_key,
    leaf_script: address.timeout_script,
    script_branches: address.script_branches,
  });

  return {...address, control_block: block};
};

const tests = [
  {
    args: {expiry: 1, network: 'btc', server_public_key: serverKey},
    description: 'A client public key is expected',
    error: 'ExpectedClientPublicKeyForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey.slice(2),
      expiry: 1,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'A compressed client public key is expected',
    error: 'ExpectedClientPublicKeyForSharedAddressScript',
  },
  {
    args: {
      client_public_key: `02${'0'.repeat(62)}05`,
      expiry: 1,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'A valid client public key is expected',
    error: 'ExpectedValidClientPublicKeyForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'An expiry is expected',
    error: 'ExpectedExpiryBlocksCountForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 0,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'A non zero expiry is expected',
    error: 'ExpectedExpiryBlocksCountForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 1.5,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'A whole number expiry is expected',
    error: 'ExpectedExpiryBlocksCountForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 65536,
      network: 'btc',
      server_public_key: serverKey,
    },
    description: 'An expiry that fits in a relative timelock is expected',
    error: 'ExpectedLowerExpiryBlocksCountForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 1,
      server_public_key: serverKey,
    },
    description: 'A network is expected',
    error: 'ExpectedKnownNetworkForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 1,
      network: 'network',
      server_public_key: serverKey,
    },
    description: 'A known network is expected',
    error: 'ExpectedKnownNetworkForSharedAddressScript',
  },
  {
    args: {client_public_key: clientKey, expiry: 1, network: 'btc'},
    description: 'A server public key is expected',
    error: 'ExpectedServerPublicKeyForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey,
      expiry: 1,
      network: 'btc',
      server_public_key: `03${'f'.repeat(64)}`,
    },
    description: 'A valid server public key is expected',
    error: 'ExpectedValidServerPublicKeyForSharedAddressScript',
  },
  {
    args: {
      client_public_key: clientKey.toUpperCase(),
      expiry: 14400,
      network: 'btc',
      server_public_key: serverKey.toUpperCase(),
    },
    description: 'Uppercase hex keys give the same shared address',
    expected: expectedFor({network: 'btc', vector: vectors[0]}),
  },
  ...vectors.flatMap(casesFor),
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => sharedAddressFor(args), new Error(error), 'Got error');
    } else {
      deepEqual(sharedAddressFor(args), expected, 'Got shared address');
    }

    return end();
  });
});
