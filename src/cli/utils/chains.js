const Debug = require('debug');
const { ethers } = require('ethers');
const {
  getChainDefaults,
  isEnterpriseEnabled,
} = require('../../common/utils/config');
const IExecContractsClient = require('../../common/utils/IExecContractsClient');
const { EnhancedWallet } = require('../../common/utils/signers');
const { loadChainConf } = require('./fs');
const { Spinner } = require('./cli-helper');
const { getReadOnlyProvider } = require('../../common/utils/providers');

const debug = Debug('iexec:chains');

const CHAIN_ALIASES_MAP = {
  1: 'mainnet',
  5: 'goerli',
  133: 'viviani',
  134: 'bellecour',
};

const CHAIN_NAME_MAP = {
  1: { id: '1', flavour: 'standard' },
  mainnet: { id: '1', flavour: 'standard' },
  5: { id: '5', flavour: 'standard' },
  goerli: { id: '5', flavour: 'standard' },
  133: { id: '133', flavour: 'standard' },
  viviani: { id: '133', flavour: 'standard' },
  134: { id: '134', flavour: 'standard' },
  bellecour: { id: '134', flavour: 'standard' },
  enterprise: { id: '1', flavour: 'enterprise' },
  'enterprise-testnet': { id: '5', flavour: 'enterprise' },
};

const ENTERPRISE_SWAP_MAP = {
  1: 'enterprise',
  mainnet: 'enterprise',
  5: 'enterprise-testnet',
  goerli: 'enterprise-testnet',
  enterprise: 'mainnet',
  'enterprise-testnet': 'goerli',
};

const createChainFromConf = (
  chainName,
  chainConf,
  { bridgeConf, enterpriseSwapConf, providerOptions, txOptions = {} } = {},
) => {
  try {
    const chain = { ...chainConf };
    const provider =
      chainConf.host && chainConf.host.indexOf('http') === 0
        ? new ethers.providers.JsonRpcProvider(chainConf.host, {
            ensAddress: chainConf.ensRegistry,
            chainId: parseInt(chainConf.id, 10),
            name: chainName,
          })
        : getReadOnlyProvider(chainConf.host, { providers: providerOptions });

    chain.name = chainName;
    const contracts = new IExecContractsClient({
      provider,
      chainId: chain.id,
      hubAddress: chain.hub,
      useGas: chain.useGas,
      isNative: chain.native,
      flavour: chain.flavour,
      confirms: txOptions.confirms,
    });
    chain.contracts = contracts;
    if (bridgeConf) {
      chain.bridgedNetwork = { ...bridgeConf };
      const bridgeProvider =
        bridgeConf.host && bridgeConf.host.indexOf('http') === 0
          ? new ethers.providers.JsonRpcProvider(bridgeConf.host, {
              ensAddress: bridgeConf.ensRegistry,
              chainId: parseInt(bridgeConf.id, 10),
            })
          : getReadOnlyProvider(bridgeConf.host, {
              providers: providerOptions,
            });
      chain.bridgedNetwork.contracts = new IExecContractsClient({
        provider: bridgeProvider,
        chainId: bridgeConf.id,
        hubAddress: bridgeConf.hub,
        useGas: bridgeConf.useGas,
        isNative: bridgeConf.native,
        flavour: bridgeConf.flavour,
        confirms: txOptions.confirms,
      });
    }
    if (enterpriseSwapConf) {
      chain.enterpriseSwapNetwork = { ...enterpriseSwapConf };
      chain.enterpriseSwapNetwork.contracts = new IExecContractsClient({
        provider,
        chainId: enterpriseSwapConf.id,
        hubAddress: enterpriseSwapConf.hub,
        useGas: enterpriseSwapConf.useGas,
        isNative: enterpriseSwapConf.native,
        flavour: enterpriseSwapConf.flavour,
        confirms: txOptions.confirms,
      });
    }
    return chain;
  } catch (error) {
    debug('createChainFromConf()', error);
    throw error;
  }
};

const loadChain = async (
  chainName,
  { txOptions, spinner = Spinner() } = {},
) => {
  try {
    const chainsConf = await loadChainConf();
    debug('chainsConf', chainsConf);
    const providerOptions = chainsConf.providers;
    let name;
    let loadedConf;
    if (chainName) {
      if (chainsConf.chains[chainName]) {
        loadedConf = chainsConf.chains[chainName];
        name = chainName;
      } else {
        const alias = CHAIN_ALIASES_MAP[chainName];
        if (alias && chainsConf.chains[alias]) {
          loadedConf = chainsConf.chains[alias];
          name = alias;
        }
        if (!name) throw Error(`Missing "${chainName}" chain in "chain.json"`);
      }
    } else if (chainsConf.default) {
      if (chainsConf.chains[chainsConf.default]) {
        name = chainsConf.default;
        loadedConf = chainsConf.chains[chainsConf.default];
      } else {
        throw Error(`Missing "${chainsConf.default}" chain in "chain.json"`);
      }
    } else if (chainsConf.chains && chainsConf.chains.goerli) {
      name = 'goerli';
      loadedConf = chainsConf.chain.goerli;
    }
    if (!name)
      throw Error('Missing chain parameter. Check your "chain.json" file');

    const idAndFlavour = {
      ...CHAIN_NAME_MAP[name],
      ...(loadedConf.id && { id: loadedConf.id }),
      ...(loadedConf.flavour && { flavour: loadedConf.flavour }),
    };

    const defaultConf = getChainDefaults(idAndFlavour);

    debug('loading chain', name);
    debug('loadedConf', loadedConf);
    debug('defaultConf', defaultConf);
    const conf = { ...idAndFlavour, ...defaultConf, ...loadedConf };
    debug('conf', conf);
    if (!conf.host) {
      throw Error(
        `Missing RPC host, no "host" key in "chain.json" and no default value for chain ${conf.id}`,
      );
    }

    let bridgeConf;
    const bridgedChainNameOrId = conf.bridge && conf.bridge.bridgedChainName;
    if (bridgedChainNameOrId) {
      let bridgeLoadedConf;
      if (chainsConf.chains[bridgedChainNameOrId]) {
        bridgeLoadedConf = chainsConf.chains[bridgedChainNameOrId];
      } else {
        const alias = CHAIN_ALIASES_MAP[bridgedChainNameOrId];
        if (alias && chainsConf.chains[alias]) {
          bridgeLoadedConf = chainsConf.chains[alias];
        }
        if (!bridgeLoadedConf)
          throw Error(`Missing "${name}" chain in "chain.json"`);
      }
      const bridgedIdAndFlavour = {
        ...CHAIN_NAME_MAP[bridgedChainNameOrId],
        ...(bridgeLoadedConf.id && { id: bridgeLoadedConf.id }),
        ...(bridgeLoadedConf.flavour && { flavour: bridgeLoadedConf.flavour }),
      };
      const bridgeDefaultConf = getChainDefaults(bridgedIdAndFlavour);
      debug('bridgeLoadedConf', bridgeLoadedConf);
      debug('bridgeDefaultConf', defaultConf);
      bridgeConf = {
        ...bridgedIdAndFlavour,
        ...bridgeDefaultConf,
        ...bridgeLoadedConf,
      };
      if (!bridgeConf.host) {
        throw Error(
          `Missing RPC host for bridged chain, no "host" key in "chain.json" and no default value for bridged chain ${bridgeConf.id}`,
        );
      }
    }
    debug('bridged chain', bridgeConf);

    let enterpriseSwapConf;
    const enterpriseSwapChainName =
      (conf.enterprise && conf.enterprise.enterpriseSwapChainName) ||
      ENTERPRISE_SWAP_MAP[name];
    const enterpriseSwapFlavour =
      conf.flavour === 'enterprise' ? 'standard' : 'enterprise';
    if (isEnterpriseEnabled(conf.id) || enterpriseSwapChainName) {
      let enterpriseSwapLoadedConf;
      if (chainsConf.chains[enterpriseSwapChainName]) {
        enterpriseSwapLoadedConf = chainsConf.chains[enterpriseSwapChainName];
      }
      const enterpriseSwapIdAndFlavour = {
        ...CHAIN_NAME_MAP[enterpriseSwapChainName],
        ...(enterpriseSwapLoadedConf &&
          enterpriseSwapLoadedConf.id && { id: enterpriseSwapLoadedConf.id }),
        flavour: enterpriseSwapFlavour,
      };
      const enterpriseSwapDefaultConf = getChainDefaults(
        enterpriseSwapIdAndFlavour,
      );
      debug('enterpriseSwapLoadedConf', enterpriseSwapLoadedConf);
      debug('enterpriseSwapDefaultConf', defaultConf);
      enterpriseSwapConf = {
        ...enterpriseSwapIdAndFlavour,
        ...{ host: conf.host },
        ...enterpriseSwapDefaultConf,
        ...enterpriseSwapLoadedConf,
      };
      if (!enterpriseSwapConf.host) {
        throw Error(
          `Missing RPC host for enterprise bound chain, no "host" key in "chain.json" and no default value for bridged chain ${bridgeConf.id}`,
        );
      }
    }
    debug('enterprise swap chain', enterpriseSwapConf);
    const chain = createChainFromConf(name, conf, {
      bridgeConf,
      enterpriseSwapConf,
      providerOptions,
      txOptions,
    });
    spinner.info(`Using chain ${name} [chainId: ${chain.id}]`);
    return chain;
  } catch (error) {
    debug('loadChain()', error);
    throw error;
  }
};

const connectKeystore = async (chain, keystore, { txOptions = {} } = {}) => {
  const { privateKey } = await keystore.load();
  const keystoreOptions = { gasPrice: txOptions.gasPrice };
  chain.contracts.setSigner(
    new EnhancedWallet(privateKey, undefined, keystoreOptions),
  );
};

module.exports = {
  loadChain,
  connectKeystore,
};
