[iexec](../README.md) / [Exports](../modules.md) / IExecModule

# Class: IExecModule

module base

## Hierarchy

- **`IExecModule`**

  ↳ [`IExec`](IExec.md)

  ↳ [`IExecAccountModule`](IExecAccountModule.md)

  ↳ [`IExecAppModule`](IExecAppModule.md)

  ↳ [`IExecDatasetModule`](IExecDatasetModule.md)

  ↳ [`IExecDealModule`](IExecDealModule.md)

  ↳ [`IExecENSModule`](IExecENSModule.md)

  ↳ [`IExecHubModule`](IExecHubModule.md)

  ↳ [`IExecNetworkModule`](IExecNetworkModule.md)

  ↳ [`IExecOrderModule`](IExecOrderModule.md)

  ↳ [`IExecOrderbookModule`](IExecOrderbookModule.md)

  ↳ [`IExecResultModule`](IExecResultModule.md)

  ↳ [`IExecSecretsModule`](IExecSecretsModule.md)

  ↳ [`IExecStorageModule`](IExecStorageModule.md)

  ↳ [`IExecTaskModule`](IExecTaskModule.md)

  ↳ [`IExecWalletModule`](IExecWalletModule.md)

  ↳ [`IExecWorkerpoolModule`](IExecWorkerpoolModule.md)

## Table of contents

### Constructors

- [constructor](IExecModule.md#constructor)

### Properties

- [config](IExecModule.md#config)

### Methods

- [fromConfig](IExecModule.md#fromconfig)

## Constructors

### constructor

• **new IExecModule**(`configOrArgs`, `options?`)

Create an IExecModule instance using an IExecConfig like

#### Parameters

| Name | Type |
| :------ | :------ |
| `configOrArgs` | [`IExecConfigArgs`](../interfaces/internal_.IExecConfigArgs.md) \| [`IExecConfig`](IExecConfig.md) |
| `options?` | [`IExecConfigOptions`](../interfaces/internal_.IExecConfigOptions.md) |

## Properties

### config

• **config**: [`IExecConfig`](IExecConfig.md)

current IExecConfig

## Methods

### fromConfig

▸ `Static` **fromConfig**(`config`): [`IExecModule`](IExecModule.md)

Create an IExecModule instance using an IExecConfig instance

#### Parameters

| Name | Type |
| :------ | :------ |
| `config` | [`IExecConfig`](IExecConfig.md) |

#### Returns

[`IExecModule`](IExecModule.md)
