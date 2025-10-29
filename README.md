## Programs

### Setup
```bash
anchor build
yarn
anchor keys sync
```

### Testing
```toml
[provider]
cluster = "localnet"
```
Make sure to set the provider cluster to `localnet` when testing locally.

```bash
anchor test
```

if you want to run tests on `devnet`, change the cluster accordingly:
```toml
[provider]
cluster = "devnet"
```
```bash
anchor test --skip-deploy # for preexisting deployments
```

### Deployment
```toml
[provider]
cluster = "devnet"
```
Set the provider cluster to `devnet` (or `mainnet` as needed) when deploying.
```bash
anchor deploy
```