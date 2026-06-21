"use client";
// Real on-chain writes for the Fund402 LP dashboard.
//
// Builds `deposit_liquidity` / `withdraw_liquidity` (vault) and `approve`
// (CEP-18) deploys with casper-js-sdk v5, then SIGNS + SUBMITS them through the
// connected CSPR.click wallet via `clickRef.send(deployJson, publicKey, wait)`.
// No private key ever touches the browser — the wallet signs.

import {
  Deploy,
  DeployHeader,
  ExecutableDeployItem,
  StoredContractByHash,
  ContractHash,
  Args,
  CLValue,
  Key,
  Duration,
  DEFAULT_DEPLOY_TTL,
  PublicKey,
} from "casper-js-sdk";

const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "casper-test";
const VAULT_CONTRACT_HASH = (process.env.NEXT_PUBLIC_VAULT_CONTRACT_HASH ?? "").replace(
  /^(hash-|contract-)/,
  ""
);
const ASSET_CONTRACT_HASH = (process.env.NEXT_PUBLIC_X402_ASSET_CONTRACT_HASH ?? "").replace(
  /^(hash-|contract-)/,
  ""
);
const ASSET_DECIMALS = Number(process.env.NEXT_PUBLIC_X402_ASSET_DECIMALS ?? "9");

/** Parse a decimal string ("12.5") into CEP-18 base units (bigint). */
export function toBaseUnits(decimal: string, decimals = ASSET_DECIMALS): bigint {
  const [whole, frac = ""] = decimal.replace(/[^0-9.]/g, "").split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

/** Minimal subset of the CSPR.click SDK we use (the value from `useClickRef()`). */
export interface ClickLike {
  getActivePublicKey(): Promise<string | undefined>;
  send(
    deployJson: string | object,
    signingPublicKey: string,
    waitProcessing?: boolean,
    timeout?: number
  ): Promise<{ deployHash?: string; deploy_hash?: string } | undefined>;
}

/** Build an unsigned stored-contract-by-hash call and serialize to deploy JSON. */
function buildCallJson(
  senderHex: string,
  contractHash: string,
  entryPoint: string,
  args: Args,
  gasMotes: string
): object {
  const sender = PublicKey.fromHex(senderHex);
  const header = DeployHeader.default();
  header.account = sender;
  header.chainName = CHAIN_NAME;
  header.ttl = new Duration(DEFAULT_DEPLOY_TTL);

  const session = new ExecutableDeployItem();
  session.storedContractByHash = new StoredContractByHash(
    ContractHash.newContract(contractHash),
    entryPoint,
    args
  );

  const payment = ExecutableDeployItem.standardPayment(gasMotes);
  const deploy = Deploy.makeDeploy(header, payment, session);
  return Deploy.toJSON(deploy) as object;
}

function hashOf(res: { deployHash?: string; deploy_hash?: string } | undefined): string {
  return res?.deployHash ?? res?.deploy_hash ?? "";
}

async function activeKey(click: ClickLike): Promise<string> {
  const pub = await click.getActivePublicKey();
  if (!pub) throw new Error("No active CSPR.click account — connect a wallet first.");
  return pub;
}

/** Approve the vault to pull `amount` of the CEP-18 asset from the connected account. */
export async function approveVault(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_CONTRACT_HASH) throw new Error("NEXT_PUBLIC_VAULT_CONTRACT_HASH not set.");
  if (!ASSET_CONTRACT_HASH) throw new Error("NEXT_PUBLIC_X402_ASSET_CONTRACT_HASH not set.");
  const pub = await activeKey(click);
  const args = Args.fromMap({
    spender: CLValue.newCLKey(Key.newKey("hash-" + VAULT_CONTRACT_HASH)),
    amount: CLValue.newCLUInt256(amount.toString()),
  });
  const json = buildCallJson(pub, ASSET_CONTRACT_HASH, "approve", args, "2000000000");
  return hashOf(await click.send(json, pub, true));
}

/**
 * Deposit CEP-18 liquidity into the vault. Two signed deploys: `approve` the
 * vault for `amount`, then `deposit_liquidity(amount)` (the vault does
 * transfer_from(lp → vault)).
 */
export async function depositLiquidity(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_CONTRACT_HASH) throw new Error("NEXT_PUBLIC_VAULT_CONTRACT_HASH not set.");
  const pub = await activeKey(click);
  await approveVault(click, amount);
  const args = Args.fromMap({ amount: CLValue.newCLUInt256(amount.toString()) });
  const json = buildCallJson(pub, VAULT_CONTRACT_HASH, "deposit_liquidity", args, "5000000000");
  return hashOf(await click.send(json, pub, true));
}

/** Withdraw previously deposited (non-loaned) liquidity from the vault. */
export async function withdrawLiquidity(click: ClickLike, amount: bigint): Promise<string> {
  if (!VAULT_CONTRACT_HASH) throw new Error("NEXT_PUBLIC_VAULT_CONTRACT_HASH not set.");
  const pub = await activeKey(click);
  const args = Args.fromMap({ amount: CLValue.newCLUInt256(amount.toString()) });
  const json = buildCallJson(pub, VAULT_CONTRACT_HASH, "withdraw_liquidity", args, "5000000000");
  return hashOf(await click.send(json, pub, true));
}
