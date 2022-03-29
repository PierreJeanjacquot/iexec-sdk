const Debug = require('debug');
const { Contract, utils } = require('ethers');
const RegistryEntry = require('@iexec/poco/build/contracts-min/RegistryEntry.json');
const ENSRegistry = require('../abi/ens/ENSRegistry-min.json');
const FIFSRegistrar = require('../abi/ens/FIFSRegistrar-min.json');
const PublicResolver = require('../abi/ens/PublicResolver-min.json');
const ReverseRegistrar = require('../abi/ens/ReverseRegistrar-min.json');
const {
  throwIfMissing,
  addressSchema,
  ensDomainSchema,
  ensLabelSchema,
  textRecordKeySchema,
  textRecordValueSchema,
} = require('../utils/validator');
const { getAddress } = require('./wallet');
const { wrapSend, wrapWait, wrapCall } = require('../utils/errorWrappers');
const { Observable, SafeObserver } = require('../utils/reactive');
const { NULL_ADDRESS } = require('../utils/utils');

const debug = Debug('iexec:ens');

const BASE_DOMAIN = 'users.iexec.eth';

const getEnsAddress = async (contracts = throwIfMissing()) => {
  try {
    const { ensAddress } = await wrapCall(contracts.provider.getNetwork());
    if (!ensAddress) {
      throw Error('network does not support ENS');
    }
    return ensAddress;
  } catch (e) {
    debug('getEnsAddress()', e);
    throw e;
  }
};

const getOwner = async (
  contracts = throwIfMissing(),
  name = throwIfMissing(),
) => {
  try {
    const vName = await ensDomainSchema().validate(name);
    const nameHash = utils.namehash(vName);
    const ensAddress = await getEnsAddress(contracts);
    const ensRegistryContract = new Contract(
      ensAddress,
      ENSRegistry.abi,
      contracts.provider,
    );
    const owner = await wrapCall(ensRegistryContract.owner(nameHash));
    return owner;
  } catch (e) {
    debug('getOwner()', e);
    throw e;
  }
};

const resolveName = async (
  contracts = throwIfMissing(),
  name = throwIfMissing(),
) => {
  try {
    const vName = await ensDomainSchema().validate(name);
    const address = await wrapCall(contracts.provider.resolveName(vName));
    return address;
  } catch (e) {
    debug('resolveName()', e);
    throw e;
  }
};

const lookupAddress = async (
  contracts = throwIfMissing(),
  address = throwIfMissing(),
) => {
  try {
    const vAddress = await addressSchema({
      ethProvider: contracts.provider,
    }).validate(address);
    const ens = await wrapCall(contracts.provider.lookupAddress(vAddress));
    return ens;
  } catch (e) {
    debug('lookupAddress()', e);
    throw e;
  }
};

const registerFifsEns = async (
  contracts = throwIfMissing(),
  label = throwIfMissing(),
  domain = BASE_DOMAIN,
) => {
  try {
    const vDomain = await ensDomainSchema().validate(domain);
    const vLabel = await ensLabelSchema().validate(label);
    let registerTxHash;
    const name = `${vLabel}.${vDomain}`;
    const labelHash = utils.id(vLabel);
    const address = await getAddress(contracts);
    const ownedBy = await getOwner(contracts, name);
    if (ownedBy === NULL_ADDRESS) {
      const domainOwner = await getOwner(contracts, vDomain);
      const domainOwnerCode = await wrapCall(
        contracts.provider.getCode(domainOwner),
      );
      if (domainOwnerCode === '0x') {
        throw Error(
          `The base domain ${vDomain} owner ${domainOwner} is not a contract`,
        );
      }
      const fifsRegistrarContract = new Contract(
        domainOwner,
        FIFSRegistrar.abi,
        contracts.signer,
      );
      const registerTx = await wrapSend(
        fifsRegistrarContract.register(labelHash, address, contracts.txOptions),
      );
      await wrapWait(registerTx.wait(contracts.confirms));
      registerTxHash = registerTx.hash;
    } else if (ownedBy.toLowerCase() === address.toLowerCase()) {
      debug(`${name} is already owned by current wallet ${ownedBy}`);
    } else {
      throw Error(`${name} is already owned by ${ownedBy}`);
    }
    return {
      registerTxHash,
      name,
    };
  } catch (e) {
    debug('registerFifsEns()', e);
    throw e;
  }
};

const obsConfigureResolutionMessages = {
  DESCRIBE_WORKFLOW: 'DESCRIBE_WORKFLOW',
  SET_RESOLVER_TX_REQUEST: 'SET_RESOLVER_TX_REQUEST',
  SET_RESOLVER_TX_SENT: 'SET_RESOLVER_TX_SENT',
  SET_RESOLVER_SUCCESS: 'SET_RESOLVER_SUCCESS',
  SET_ADDR_TX_REQUEST: 'SET_ADDR_TX_REQUEST',
  SET_ADDR_TX_SENT: 'SET_ADDR_TX_SENT',
  SET_ADDR_SUCCESS: 'SET_ADDR_SUCCESS',
  CLAIM_REVERSE_WITH_RESOLVER_TX_REQUEST:
    'CLAIM_REVERSE_WITH_RESOLVER_TX_REQUEST',
  CLAIM_REVERSE_WITH_RESOLVER_TX_SENT: 'CLAIM_REVERSE_WITH_RESOLVER_TX_SENT',
  CLAIM_REVERSE_WITH_RESOLVER_SUCCESS: 'CLAIM_REVERSE_WITH_RESOLVER_SUCCESS',
  SET_NAME_TX_REQUEST: 'SET_NAME_TX_REQUEST',
  SET_NAME_TX_SENT: 'SET_NAME_TX_SENT',
  SET_NAME_SUCCESS: 'SET_NAME_SUCCESS',
};

const obsConfigureResolution = (
  contracts = throwIfMissing(),
  publicResolverAddress = throwIfMissing(),
  name = throwIfMissing(),
  address,
) =>
  new Observable((observer) => {
    const safeObserver = new SafeObserver(observer);
    let abort = false;

    const configure = async () => {
      try {
        const vAddress =
          address !== undefined
            ? await addressSchema().validate(address)
            : await getAddress(contracts);
        const vName = await ensDomainSchema().validate(name);
        const nameHash = utils.namehash(vName);
        const walletAddress = await getAddress(contracts);
        const ensAddress = await getEnsAddress(contracts);

        const REVERSE_DOMAIN = 'addr.reverse';
        const reverseName = `${vAddress
          .toLowerCase()
          .substring(2)}.${REVERSE_DOMAIN}`;

        let addressIsContract = false;
        if (vAddress !== walletAddress) {
          const addressCode = await wrapCall(
            contracts.provider.getCode(vAddress),
          );
          if (addressCode === '0x') {
            throw Error(
              `Target address ${vAddress} is not a contract and don't match current wallet address ${walletAddress}, impossible to setup ENS resolution`,
            );
          } else {
            addressIsContract = true;
          }
        }

        const nameOwner = await getOwner(contracts, vName);
        if (nameOwner.toLowerCase() !== walletAddress.toLowerCase()) {
          throw Error(
            `The current address ${walletAddress} is not owner of ${vName}`,
          );
        }

        if (addressIsContract) {
          const registryEntryContract = new Contract(
            vAddress,
            RegistryEntry.abi,
            contracts.signer,
          );
          const entryOwner = await wrapCall(registryEntryContract.owner());
          if (
            !(
              entryOwner &&
              entryOwner.toLowerCase() === walletAddress.toLowerCase()
            )
          ) {
            throw Error(
              `${walletAddress} is not the owner of ${vAddress}, impossible to setup ENS resolution`,
            );
          }
        }

        if (abort) return;
        safeObserver.next({
          message: obsConfigureResolutionMessages.DESCRIBE_WORKFLOW,
          addessType: addressIsContract ? 'CONTRACT' : 'EAO',
          steps: ['SET_RESOLVER', 'SET_ADDR']
            .concat(addressIsContract ? [] : ['CLAIM_REVERSE_WITH_RESOLVER'])
            .concat(['SET_NAME']),
        });

        const resolverCode = await wrapCall(
          contracts.provider.getCode(publicResolverAddress),
        );
        if (resolverCode === '0x') {
          throw Error(
            `The resolver ${publicResolverAddress} is not a contract`,
          );
        }

        // 1 - setup resolution
        // set resolver
        const currentResolver = await wrapCall(
          contracts.provider.getResolver(vName),
        );
        const isResolverSet =
          currentResolver &&
          currentResolver.address &&
          currentResolver.address.toLowerCase() ===
            publicResolverAddress.toLowerCase();

        if (!isResolverSet) {
          const registryContract = new Contract(
            ensAddress,
            ENSRegistry.abi,
            contracts.signer,
          );
          safeObserver.next({
            message: obsConfigureResolutionMessages.SET_RESOLVER_TX_REQUEST,
            name: vName,
            resolverAddress: publicResolverAddress,
          });
          if (abort) return;
          const setResolverTx = await wrapSend(
            registryContract.setResolver(
              nameHash,
              publicResolverAddress,
              contracts.txOptions,
            ),
          );
          safeObserver.next({
            message: obsConfigureResolutionMessages.SET_RESOLVER_TX_SENT,
            txHash: setResolverTx.hash,
          });
          if (abort) return;
          await wrapWait(setResolverTx.wait(contracts.confirms));
        }
        safeObserver.next({
          message: obsConfigureResolutionMessages.SET_RESOLVER_SUCCESS,
          name: vName,
          resolverAddress: publicResolverAddress,
        });

        // set addr
        const resolverContract = new Contract(
          publicResolverAddress,
          PublicResolver.abi,
          contracts.signer,
        );
        const addr = await wrapCall(
          resolverContract.functions['addr(bytes32)'](nameHash),
        );
        const isAddrSet =
          addr && addr[0] && addr[0].toLowerCase() === vAddress.toLowerCase();

        if (!isAddrSet) {
          safeObserver.next({
            message: obsConfigureResolutionMessages.SET_ADDR_TX_REQUEST,
            name: vName,
            address: vAddress,
          });
          if (abort) return;
          const setAddrTx = await wrapSend(
            resolverContract.functions['setAddr(bytes32,address)'](
              nameHash,
              vAddress,
              contracts.txOptions,
            ),
          );
          safeObserver.next({
            message: obsConfigureResolutionMessages.SET_ADDR_TX_SENT,
            txHash: setAddrTx.hash,
          });
          if (abort) return;
          await wrapWait(setAddrTx.wait(contracts.confirms));
        }
        safeObserver.next({
          message: obsConfigureResolutionMessages.SET_ADDR_SUCCESS,
          name: vName,
          address: vAddress,
        });

        // 2 - setup reverse resolution
        const configuredName = await lookupAddress(contracts, vAddress);
        if (configuredName !== vName) {
          if (addressIsContract) {
            // set name for iExec NFTs
            const registryEntryContract = new Contract(
              vAddress,
              RegistryEntry.abi,
              contracts.signer,
            );

            safeObserver.next({
              message: obsConfigureResolutionMessages.SET_NAME_TX_REQUEST,
              name: vName,
              address: vAddress,
            });
            if (abort) return;
            const setNameTx = await wrapSend(
              registryEntryContract.setName(
                ensAddress,
                vName,
                contracts.txOptions,
              ),
            );
            safeObserver.next({
              message: obsConfigureResolutionMessages.SET_NAME_TX_SENT,
              txHash: setNameTx.hash,
            });
            if (abort) return;
            await wrapWait(setNameTx.wait(contracts.confirms));
          } else {
            // claim reverse for EAO if needed
            const reverseNameOwner = await getOwner(contracts, reverseName);
            const reverseRegistrarAddress = await getOwner(
              contracts,
              REVERSE_DOMAIN,
            );
            const reverseRegistrarContract = new Contract(
              reverseRegistrarAddress,
              ReverseRegistrar.abi,
              contracts.signer,
            );
            const isReverseAddrClaimed =
              reverseNameOwner &&
              reverseNameOwner.toLowerCase() === walletAddress.toLowerCase();
            if (!isReverseAddrClaimed) {
              safeObserver.next({
                message:
                  obsConfigureResolutionMessages.CLAIM_REVERSE_WITH_RESOLVER_TX_REQUEST,
                address: vAddress,
                resolverAddress: publicResolverAddress,
              });
              if (abort) return;
              const claimReverseTx = await wrapSend(
                reverseRegistrarContract.claimWithResolver(
                  vAddress,
                  publicResolverAddress,
                  contracts.txOptions,
                ),
              );
              safeObserver.next({
                message:
                  obsConfigureResolutionMessages.CLAIM_REVERSE_WITH_RESOLVER_TX_SENT,
                txHash: claimReverseTx.hash,
              });
              if (abort) return;
              await wrapWait(claimReverseTx.wait(contracts.confirms));
            }
            const reverseNaneResolver = await wrapCall(
              contracts.provider.getResolver(reverseName),
            );
            safeObserver.next({
              message:
                obsConfigureResolutionMessages.CLAIM_REVERSE_WITH_RESOLVER_SUCCESS,
              address: vAddress,
              resolverAddress: reverseNaneResolver.address,
            });

            // set name for EOA
            safeObserver.next({
              message: obsConfigureResolutionMessages.SET_NAME_TX_REQUEST,
              name: vName,
              address: vAddress,
            });
            if (abort) return;
            const setNameTx = await wrapSend(
              reverseRegistrarContract.setName(vName, contracts.txOptions),
            );
            safeObserver.next({
              message: obsConfigureResolutionMessages.SET_NAME_TX_SENT,
              txHash: setNameTx.hash,
            });
            if (abort) return;
            await wrapWait(setNameTx.wait(contracts.confirms));
          }
        } else if (!addressIsContract) {
          const reverseNaneResolver = await wrapCall(
            contracts.provider.getResolver(reverseName),
          );
          safeObserver.next({
            message:
              obsConfigureResolutionMessages.CLAIM_REVERSE_WITH_RESOLVER_SUCCESS,
            address: vAddress,
            resolverAddress: reverseNaneResolver.address,
          });
        }
        safeObserver.next({
          message: obsConfigureResolutionMessages.SET_NAME_SUCCESS,
          name: vName,
          address: vAddress,
        });
        safeObserver.complete();
      } catch (e) {
        debug('obsConfigureResolution()', e);
        safeObserver.error(e);
      }
    };
    configure();

    safeObserver.unsub = () => {
      abort = true;
    };
    return safeObserver.unsubscribe.bind(safeObserver);
  });

const configureResolution = async (
  contracts = throwIfMissing(),
  publicResolverAddress = throwIfMissing(),
  name = throwIfMissing(),
  address,
) => {
  try {
    const vAddress =
      address !== undefined
        ? await addressSchema().validate(address)
        : await getAddress(contracts);
    const vName = await ensDomainSchema().validate(name);
    const configObserver = await obsConfigureResolution(
      contracts,
      publicResolverAddress,
      name,
      address,
    );
    return new Promise((resolve, reject) => {
      const result = {
        name: vName,
        address: vAddress,
      };
      configObserver.subscribe({
        error: (e) => reject(e),
        next: ({ message, ...rest }) => {
          switch (message) {
            case obsConfigureResolutionMessages.SET_RESOLVER_TX_SENT:
              result.setResolverTxHash = rest.txHash;
              break;
            case obsConfigureResolutionMessages.SET_ADDR_TX_SENT:
              result.setAddrTxHash = rest.txHash;
              break;
            case obsConfigureResolutionMessages.SET_NAME_TX_SENT:
              result.setNameTxHash = rest.txHash;
              break;
            case obsConfigureResolutionMessages.CLAIM_REVERSE_WITH_RESOLVER_TX_SENT:
              result.claimReverseTxHash = rest.txHash;
              break;
            default:
              break;
          }
        },
        complete: () => {
          resolve(result);
        },
      });
    });
  } catch (e) {
    debug('configureResolution()', e);
    throw e;
  }
};

const readTextRecord = async (contracts = throwIfMissing(), name, key) => {
  try {
    const vName = await ensDomainSchema().validate(name);
    const vKey = await textRecordKeySchema().validate(key);
    const node = utils.namehash(vName);
    const currentResolver = await wrapCall(
      contracts.provider.getResolver(vName),
    );
    const isResolverSet =
      currentResolver &&
      currentResolver.address &&
      currentResolver.address !== NULL_ADDRESS;
    if (!isResolverSet) {
      throw Error(`No resolver is configured for ${vName}`);
    }
    const resolverContract = new Contract(
      currentResolver.address,
      PublicResolver.abi,
      contracts.signer,
    );
    const txt = await wrapCall(resolverContract.text(node, vKey));
    return txt;
  } catch (e) {
    debug('readText()', e);
    throw e;
  }
};

const setTextRecord = async (
  contracts = throwIfMissing(),
  name,
  key,
  value = '',
) => {
  try {
    const vName = await ensDomainSchema().validate(name);
    const vKey = await textRecordKeySchema().validate(key);
    const vValue = await textRecordValueSchema().validate(value);
    const node = utils.namehash(vName);
    const currentResolver = await wrapCall(
      contracts.provider.getResolver(vName),
    );
    const isResolverSet =
      currentResolver &&
      currentResolver.address &&
      currentResolver.address !== NULL_ADDRESS;
    if (!isResolverSet) {
      throw Error(`No resolver is configured for ${vName}`);
    }
    const ownedBy = await getOwner(contracts, vName);
    const userAddress = await getAddress(contracts);
    if (ownedBy !== userAddress) {
      throw Error(
        `${userAddress} is not authorised to set a text record for ${vName}`,
      );
    }
    const resolverContract = new Contract(
      currentResolver.address,
      PublicResolver.abi,
      contracts.signer,
    );
    const tx = await wrapSend(resolverContract.setText(node, vKey, vValue));
    await wrapWait(tx.wait(contracts.confirms));
    return tx.hash;
  } catch (e) {
    debug('setTextRecord()', e);
    throw e;
  }
};

module.exports = {
  getOwner,
  resolveName,
  lookupAddress,
  registerFifsEns,
  configureResolution,
  obsConfigureResolution,
  readTextRecord,
  setTextRecord,
};
