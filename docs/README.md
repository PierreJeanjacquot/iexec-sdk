iexec / [Exports](modules.md)

[< Back home](../README.md)

# iExec SDK Library API

[![Build Status](https://drone.iex.ec/api/badges/iExecBlockchainComputing/iexec-sdk/status.svg)](https://drone.iex.ec/iExecBlockchainComputing/iexec-sdk)
[![npm version](https://badge.fury.io/js/iexec.svg)](https://www.npmjs.com/package/iexec) [![npm version](https://img.shields.io/npm/dm/iexec.svg)](https://www.npmjs.com/package/iexec) [![license](https://img.shields.io/github/license/iExecBlockchainComputing/iexec-sdk.svg)](LICENSE)

Use the iExec decentralised marketplace for off-chain computing in your dapp.

## Content

- [Install](#install)
- [Quick start](#quick-start)
- [API](#api)
  - [IExecModules](#iexecmodules)
  - [utils](#utils)
  - [errors](#errors)
- [Live demos](#live-demos)

---

# Install

Install iexec sdk

```bash
npm install iexec
```

---

# Quick start

## Front-end integration

```js
import { IExec } from 'iexec';

// connect injected provider
const iexec = new IExec({ ethProvider: window.ethereum });
```

**NB:** `iexec` SDK require some NodeJS modules to work, in the browser your bundler might on might not provides polyfills for these modules. If your bundler does not automatically includes NodeJS polyfills you must add them by yourself.

### Webpack

`webpack` >= 5 no longer provides polyfills for NodeJS, you must include them in your configuration.

Here are the recommanded polyfills for the required NodeJS modudes:

- crypto: fallback to `crypto-browserify`
- stream: fallback to `stream-browserify`
- constants: fallback to `constants-browserify`
- Buffer: fallback to `buffer`

### Create-react-app

`create-react-app` >= 5 which relies on `webpack` >= 5 requires to customize the configuration to include NodeJS polyfills.

Since `react-scripts` enforce the `webpack` configuration and ejecting is not an option, you will need to use `react-app-rewired` to override the configuration.

Here is the steps to follow:

- Install the following dev-dependencies:

```bash
npm install --save-dev react-app-rewired crypto-browserify stream-browserify constants-browserify process
```

- Create the following `config-overrides.js` at the root of your project:

```js
const webpack = require('webpack');

module.exports = function override(config) {
  const fallback = config.resolve.fallback || {};
  Object.assign(fallback, {
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    constants: require.resolve('constants-browserify'),
  });
  config.resolve.fallback = fallback;
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer'],
    }),
  ]);
  return config;
};
```

- Use `react-app-rewired` instead of `react-scripts` in your package.json scripts:

```json
{
  ...
  "scripts": {
    "start": "react-app-rewired start",
    "build": "react-app-rewired build",
    "test": "react-app-rewired test",
    "eject": "react-scripts eject"
  }
}
```

## Back-end integration

```js
const { IExec, utils } = require('iexec');

const { PRIVATE_KEY } = process.env;

const ethProvider = utils.getSignerFromPrivateKey(
  'http://localhost:8545', // blockchain node URL
  PRIVATE_KEY,
);
const iexec = new IExec({
  ethProvider,
});
```

---

# API

## IExecModules

IExec SDK is splitted into [IExecModule](./classes/IExecModule.md)s, each providing a set of methods relatives to a specific field.

Additionaly the [IExec](./classes/IExec.md) module exposes all the following listed modules under the corresponding namespace.

- [IExecAccountModule](./classes/IExecAccountModule.md) exposes **account** methods
- [IExecAppModule](./classes/IExecAppModule.md) exposes **app** methods
- [IExecDatasetModule](./classes/IExecDatasetModule.md) exposes **dataset** methods
- [IExecDealModule](./classes/IExecDealModule.md) exposes **deal** methods
- [IExecENSModule](./classes/IExecENSModule.md) exposes **ENS** methods
- [IExecHubModule](./classes/IExecHubModule.md) exposes **hub** methods
- [IExecNetworkModule](./classes/IExecNetworkModule.md) exposes **network** methods
- [IExecOrderModule](./classes/IExecOrderModule.md) exposes **order** methods
- [IExecOrderbookModule](./classes/IExecOrderbookModule.md) exposes **orderbook** methods
- [IExecResultModule](./classes/IExecResultModule.md) exposes **result** methods
- [IExecSecretsModule](./classes/IExecSecretsModule.md) exposes **secrets** methods
- [IExecStorageModule](./classes/IExecStorageModule.md) exposes **storage** methods
- [IExecTaskModule](./classes/IExecTaskModule.md) exposes **task** methods
- [IExecWalletModule](./classes/IExecWalletModule.md) exposes **wallet** methods
- [IExecWorkerpoolModule](./classes/IExecWorkerpoolModule.md) exposes **workerpool** methods

### Imports

As your app won't probably use all the features, you may want to import only the modules you need.

Each module is available as an independant package under `iexec/MODULE_NAME` and is exported in the umbrella package.

_example:_

- import from module package

```js
import IExecWalletModule from 'iexec/IExecWalletModule';
```

- import from umbrella

```js
import { IExecWalletModule } from 'iexec';
```

### Usage

[IExecModule](./classes/IExecModule.md)s are instancied with an [IExecConfig](./classes/IExecConfig.md) providing the configuration to access to a specific instance of the iExec platform.

Once created, an [IExecConfig](./classes/IExecConfig.md) can be shared with any [IExecModule](./classes/IExecModule.md).

_example:_

- standard usage

```js
import IExecConfig from 'iexec/IExecConfig';

import IExecWalletModule from 'iexec/IExecWalletModule';
import IExecAccountModule from 'iexec/IExecAccountModule';

// create the config once for the target iExec instance
const config = new IExecConfig({ ethProvider: window.ethereum });

// share it with all the modules
const wallet = IExecWalletModule.fromConfig(config);
const account = IExecAccountModule.fromConfig(config);
```

- reuse instancied module configuration

```js
import IExecWalletModule from 'iexec/IExecWalletModule';
// some IExecModule instance
import iexecModule from './my-module';

// IExecModules expose their IExecConfig under config
const wallet = IExecWalletModule.fromConfig(iexecModule.config);
```

- quick instanciation (shorter but not recommanded)

```js
import IExecWalletModule from 'iexec/IExecWalletModule';

// the IExecConfig step can be skipped
const wallet = new IExecWalletModule({ ethProvider: window.ethereum });
```

## utils

The [utils](./modules/utils.md) namespace exposes some utility methods.

_example_:

```js
import utils from 'iexec/utils';
```

Or

```js
import { utils } from 'iexec';
```

## errors

The [errors](./modules/errors.md) namespace exposes the errors thrown by the library, use them if you want specific error handling.

_example_:

```js
import errors from 'iexec/errors';
```

Or

```js
import { errors } from 'iexec';
```

---

# Live demos

- [Buy computation](https://codesandbox.io/embed/876r7?fontsize=14&hidenavigation=1&theme=dark)
- [Deploy and sell application](https://codesandbox.io/embed/l4hh4?fontsize=14&hidenavigation=1&theme=dark)
- [Deploy and sell dataset](https://codesandbox.io/embed/micsl?fontsize=14&hidenavigation=1&theme=dark)

---

[< Back home](../README.md)
