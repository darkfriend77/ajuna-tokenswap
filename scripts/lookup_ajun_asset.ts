/**
 * Lookup AJUN Foreign Asset status on a live AssetHub endpoint.
 *
 * This script queries the chain state to determine:
 *   1. Whether AJUN is registered as a foreign asset
 *   2. Its local asset ID (if registered)
 *   3. The computed ERC20 precompile address
 *   4. Its metadata (name, symbol, decimals)
 *
 * This information is essential for configuring production deployments.
 *
 * Usage:
 *   npx ts-node scripts/lookup_ajun_asset.ts [rpc_url]
 *
 * Default RPC: wss://polkadot-asset-hub-rpc.polkadot.io
 *
 * NOTE: This script requires @polkadot/api.  Install if needed:
 *   npm install --save-dev @polkadot/api
 */

// ── Precompile address computation (standalone, no deps) ──────────
function computePrecompileAddress(assetId: number, prefix: number = 0x0120): string {
  const buf = Buffer.alloc(20, 0);
  buf.writeUInt32BE(assetId, 0);
  buf.writeUInt16BE(prefix, 16);
  return "0x" + buf.toString("hex");
}

async function main() {
  // Try to load @polkadot/api — if not installed, print instructions.
  let ApiPromise: any, WsProvider: any;
  try {
    const api = await import("@polkadot/api");
    ApiPromise = api.ApiPromise;
    WsProvider = api.WsProvider;
  } catch {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  @polkadot/api is not installed.");
    console.log("  Install it to query live chain state:");
    console.log("    npm install --save-dev @polkadot/api");
    console.log("");
    console.log("  In the meantime, here are precompile addresses for");
    console.log("  common asset IDs:");
    console.log("═══════════════════════════════════════════════════════════");
    // Print a table of example asset IDs
    for (const id of [0, 1, 100, 1000, 1984, 2051]) {
      console.log(`  Asset ID ${String(id).padStart(5)} → ${computePrecompileAddress(id)}`);
      console.log(`                    → ${computePrecompileAddress(id, 0x0220)} (foreign prefix 0x0220)`);
    }
    console.log("");
    console.log("  AJUN (Parachain 2051) MultiLocation:");
    console.log('  { parents: 1, interior: { X1: [{ Parachain: 2051 }] } }');
    console.log("");
    console.log("  Look up the actual asset ID via Polkadot.js Apps:");
    console.log("  https://polkadot.js.org/apps/?rpc=wss://polkadot-asset-hub-rpc.polkadot.io#/chainstate");
    console.log("  → foreignAssets → asset → MultiLocation above");
    return;
  }

  const rpcUrl = process.argv[2] || "wss://polkadot-asset-hub-rpc.polkadot.io";
  console.log(`Connecting to ${rpcUrl}...`);

  const provider = new WsProvider(rpcUrl);
  const api = await ApiPromise.create({ provider });

  console.log(`Connected to chain: ${(await api.rpc.system.chain()).toString()}`);
  console.log(`Runtime version: ${api.runtimeVersion.specVersion.toString()}\n`);

  // ── Query foreign assets ────────────────────────────────────────
  const ajunMultiLocation = {
    parents: 1,
    interior: { X1: [{ Parachain: 2051 }] },
  };

  console.log("Looking up AJUN foreign asset...");
  console.log(`MultiLocation: ${JSON.stringify(ajunMultiLocation)}\n`);

  try {
    // Try foreignAssets pallet
    if (api.query.foreignAssets) {
      const asset = await api.query.foreignAssets.asset(ajunMultiLocation);

      if (asset && !asset.isEmpty) {
        const data = asset.toJSON();
        console.log("✅ AJUN is registered as a Foreign Asset!");
        console.log("  Asset data:", JSON.stringify(data, null, 2));

        // Try to get metadata
        try {
          const metadata = await api.query.foreignAssets.metadata(ajunMultiLocation);
          if (metadata && !metadata.isEmpty) {
            const meta = metadata.toJSON();
            console.log("  Metadata:", JSON.stringify(meta, null, 2));
          }
        } catch {
          console.log("  (No metadata found)");
        }

        // NOTE: For foreign assets, the "asset ID" used by the precompile
        // may be derived differently than for native assets.  The precompile
        // address mapping depends on how the runtime configures the
        // pallet-assets instance for foreign assets.
        //
        // Common patterns:
        //   - Foreign assets use prefix 0x0220 instead of 0x0120
        //   - The asset ID might be a hash of the MultiLocation
        //
        // This needs to be verified against the actual runtime config.
        console.log("\n  ⚠️  Precompile address depends on the runtime's asset ID mapping.");
        console.log("  Check the runtime source for the exact prefix and ID derivation.");
      } else {
        console.log("❌ AJUN is NOT registered as a Foreign Asset on this chain.");
        console.log("   It needs to be transferred via XCM from Ajuna Network first.");
      }
    } else {
      console.log("⚠️  foreignAssets pallet not found in this runtime.");
    }
  } catch (e: any) {
    console.log(`Error querying foreign assets: ${e.message}`);
  }

  // ── Also check native assets pallet ─────────────────────────────
  try {
    if (api.query.assets) {
      console.log("\nScanning native assets pallet for AJUN...");
      // We can't easily iterate all assets, but we can check common IDs
      for (const id of [2051, 0, 1]) {
        const asset = await api.query.assets.asset(id);
        if (asset && !asset.isEmpty) {
          const meta = await api.query.assets.metadata(id);
          const name = meta?.name?.toHuman() || "?";
          const symbol = meta?.symbol?.toHuman() || "?";
          console.log(`  Asset ID ${id}: ${name} (${symbol})`);
          console.log(`    Precompile: ${computePrecompileAddress(id)}`);
        }
      }
    }
  } catch {
    console.log("  (Could not query native assets)");
  }

  // ── Reference table ─────────────────────────────────────────────
  console.log("\n═══ Precompile Address Reference ═══");
  console.log("  Formula: [assetId(4B)] [zeros(12B)] [prefix(2B)] [0x0000]");
  console.log("");
  console.log("  Native assets prefix:  0x0120");
  console.log("  Foreign assets prefix: 0x0220 (verify against runtime!)");
  console.log("");
  for (const id of [1984, 2051]) {
    console.log(`  Asset ${id} (native):  ${computePrecompileAddress(id, 0x0120)}`);
    console.log(`  Asset ${id} (foreign): ${computePrecompileAddress(id, 0x0220)}`);
  }

  await api.disconnect();
}

main().catch(console.error);
