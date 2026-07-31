# Signing the Windows build with Azure Artifact Signing

How Pix8's Windows artifacts (portable `.exe` and NSIS installer) get an Authenticode
signature via Microsoft's managed signing service.

> **Naming:** the service launched as **Trusted Signing** and was renamed to **Azure
> Artifact Signing** in early 2026. Both names refer to the same thing. The Azure portal
> and docs now say "Artifact Signing"; the Azure resource provider is still
> `Microsoft.CodeSigning`, electron-builder's config key is still `azureSignOptions`, and
> the PowerShell module it drives is still called `TrustedSigning`. Expect to see both
> spellings and don't assume you're looking at the wrong product.

This is **not** the same as Azure Key Vault + AzureSignTool. The older
`docs/installer-signing.md` describes that Key Vault approach and references a `sign.js`
that does not exist in this repo — it is stale. Follow this document instead.

## Version pinning

Everything below is written against what is actually in `node_modules`:

| Component | Version |
| --- | --- |
| `electron-builder` | 26.8.1 |
| `electron` | 35.7.5 |

electron-builder 26.x signs by invoking the `Invoke-TrustedSigning` PowerShell cmdlet.
The current electron.build website documents a **newer** shape — `win.sign` with
`type: "azure"` and a .NET 8 DLib — which 26.8.1 does **not** accept. Use the
`azureSignOptions` config in this document. If you upgrade electron-builder past 26.x,
re-check the config shape before assuming this doc still applies.

## Where we are

Your co-founder has completed **Organization / Public identity validation** and it shows
`Completed` in the portal. That is the slow part (1–20 business days) and it is done.
What remains is roughly an afternoon of Azure config plus a `package.json` change.

Public Trust certificates for organizations are available in the EU, so the entity is
eligible.

## Division of labour

The steps split cleanly between the two of you:

**Co-founder** (needs `Owner` or `User Access Administrator` on the subscription):
1. Create the certificate profile
2. Create the Entra app registration + secret
3. Assign the signer role

**You** (the person running builds): steps 4–7.

If you'd rather do it all yourself, ask them to grant you `Contributor` **and** `User
Access Administrator` on the Artifact Signing account's resource group.

---

## 1. Create a Public Trust certificate profile

A certificate profile is the container for the short-lived certs the service issues. You
need one before anything can sign.

Portal: **Artifact Signing Accounts** → your account → **Objects → Certificate profiles**
→ **Create** → **Public Trust**.

- **Certificate Profile Name**: 5–100 alphanumeric chars, must start with a letter, no
  consecutive hyphens, unique within the account. E.g. `pix8-public-trust`.
- **Program Type**: leave as `None`.
- **Verified CN and O**: select the completed organization identity validation.
- Leave "Include street address" and "Include postal code" unchecked unless you want them
  on the certificate.

Or via CLI (needs the identity validation ID, copied from **Objects → Identity
validations** → the entity → **Identity validation Id**):

```bash
az extension add --name artifact-signing

az artifact-signing certificate-profile create \
  -g <resource-group> \
  --account-name <signing-account> \
  -n pix8-public-trust \
  --profile-type PublicTrust \
  --identity-validation-id <guid>
```

**Before leaving this screen, copy the "Certificate Subject Preview" verbatim.** The `CN=`
value is what you must use as `publisherName` in step 5. Getting this wrong is the single
most common cause of a build that signs successfully but then fails verification.

> There is also a `PublicTrustTest` profile type. It signs with a certificate that chains
> to a **test root Windows does not trust**, so SmartScreen will still warn. It is useful
> for proving the pipeline works end to end without touching your real profile, but it
> proves nothing about the trust outcome. Basic SKU includes one profile of each type, so
> you can have both.

## 2. Create the build identity (Entra app registration)

electron-builder authenticates as a service principal, not as you. Even for local builds.

Portal: **Microsoft Entra ID → App registrations → New registration**. Name it something
like `pix8-signing`. Single tenant. No redirect URI.

Then **Certificates & secrets → New client secret**. Copy the secret **value**
immediately — it is only shown once.

Record three things:
- **Directory (tenant) ID** → `AZURE_TENANT_ID`
- **Application (client) ID** → `AZURE_CLIENT_ID`
- **Secret value** → `AZURE_CLIENT_SECRET`

> Client secrets expire — 24 months maximum, and Azure now defaults new secrets to a
> shorter lifetime. Put the expiry date in a shared calendar now. A silently expired
> secret shows up as an authentication failure in the middle of a release build, which is
> the worst possible time to discover it.

## 3. Assign the signer role — the step everyone misses

**`Owner` and `Contributor` do not grant the ability to sign.** They let you manage the
account and create certificate profiles, and nothing more. Signing requires the dedicated
`Artifact Signing Certificate Profile Signer` role. This is the number one reason a
correctly configured build fails with a permissions error.

Assign it to the service principal from step 2, scoped as tightly as possible — at the
certificate profile rather than the whole account:

```bash
az role assignment create \
  --assignee <service-principal-object-id> \
  --role "Artifact Signing Certificate Profile Signer" \
  --scope "/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.CodeSigning/codeSigningAccounts/<account>/certificateProfiles/<profile>"
```

Note `--assignee` wants the **object ID of the service principal**, not the application
ID. Get it with:

```bash
az ad sp show --id <application-client-id> --query id -o tsv
```

Portal equivalent: Artifact Signing account → **Access control (IAM)** → **Add role
assignment** → search "Artifact Signing".

For reference, the full role matrix:

| Role | Manage account | Manage cert profiles | **Sign** | View signing history | Manage identity validation |
| --- | :-: | :-: | :-: | :-: | :-: |
| Artifact Signing Certificate Profile Signer | | | ✅ | ✅ | |
| Artifact Signing Identity Verifier | | | | | ✅ |
| Owner | ✅ | ✅ | | | |
| Contributor | ✅ | ✅ | | | |
| Reader | ✅ | | | | |

## 4. Find your region endpoint

The endpoint URI **must** match the region the signing account was created in. A mismatch
gives an unhelpful error.

| Region | Endpoint |
| --- | --- |
| West Europe | `https://weu.codesigning.azure.net` |
| North Europe | `https://neu.codesigning.azure.net` |
| Poland Central | `https://plc.codesigning.azure.net` |
| Switzerland North | `https://swn.codesigning.azure.net` |
| East US | `https://eus.codesigning.azure.net` |
| West US 2 | `https://wus2.codesigning.azure.net` |

Others exist (Brazil South, Central US, Japan East, Korea Central, North Central US, South
Central US, West Central US, West US, West US 3) — check the account's **Overview** blade
for its region and match it.

## 5. Configure `package.json`

Add `azureSignOptions` under `build.win`. The existing `target` array is unchanged — both
the portable exe and the NSIS installer get signed.

```json
"win": {
  "target": [
    "nsis",
    "portable"
  ],
  "azureSignOptions": {
    "publisherName": "Dynart Kft.",
    "endpoint": "https://weu.codesigning.azure.net",
    "codeSigningAccountName": "<signing-account-name>",
    "certificateProfileName": "pix8-public-trust"
  }
}
```

Replace `publisherName` with the exact `CN=` value from step 1 — including any legal
suffix (`Kft.`, `Ltd`, `GmbH`), punctuation and capitalisation. It is compared as a
literal string.

Field notes:
- `codeSigningAccountName` is the Azure resource name, not the resource group.
- Optional overrides you almost certainly don't need: `fileDigest` (default `SHA256`),
  `timestampDigest` (default `SHA256`), `timestampRfc3161` (default
  `http://timestamp.acs.microsoft.com`). Timestamping is on by default — leave it on, see
  the note about 3-day certificates below.
- `azureSignOptions` and `signtoolOptions` are mutually exclusive. If both are present,
  Azure signing wins.

## 6. Set the environment variables

electron-builder 26.8.1 uses Azure's `EnvironmentCredential`. It reads credentials from
environment variables **only** — it checks for them up front and aborts if they're absent.

**`az login` alone will not work.** Neither will a managed identity or a VS Code / Azure
CLI session. This trips people up because most other Azure tooling accepts those.

Required, always:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`

Plus **one** of these three sets:
- `AZURE_CLIENT_SECRET` — the normal choice
- `AZURE_CLIENT_CERTIFICATE_PATH` (+ optional `AZURE_CLIENT_CERTIFICATE_PASSWORD`,
  `AZURE_CLIENT_SEND_CERTIFICATE_CHAIN`)
- `AZURE_USERNAME` + `AZURE_PASSWORD` — avoid; breaks under MFA

Local build (PowerShell):

```powershell
$env:AZURE_TENANT_ID     = "..."
$env:AZURE_CLIENT_ID     = "..."
$env:AZURE_CLIENT_SECRET = "..."

npm run build
npm run dist:win
```

`npm run build` (webpack) must run first — electron-builder packages `dist/bundle.js`, it
does not generate it.

If a credential is missing, the failure names the specific variable. For more detail:

```powershell
$env:DEBUG = "electron-builder"
```

> **Never commit these.** `.gitignore` currently only lists `node_modules/` and `release/`.
> If you start keeping a local `.env`, add it to `.gitignore` in the same commit — before
> the file exists, not after.

## 7. Build machine prerequisites

Signing must run **on Windows** — it shells out to PowerShell to call
`Invoke-TrustedSigning`.

On first run electron-builder automatically:
1. Installs the NuGet package provider (`Install-PackageProvider -Name NuGet -Scope CurrentUser`)
2. Installs the signing module (`Install-Module -Name TrustedSigning -MinimumVersion 0.5.0 -Repository PSGallery -Scope CurrentUser`)

Both go into the current user's scope, so no administrator rights are needed. The machine
does need outbound access to **PowerShell Gallery** and to the `*.codesigning.azure.net`
endpoint. On a locked-down network, allowlist both. Step 1 failing is logged at debug
level and is often harmless — many systems already have NuGet — but step 2 failing is
fatal.

## 8. Verify the result

```powershell
Get-AuthenticodeSignature ".\release\Pix8 1.6.5.exe" | Format-List
```

Expect `Status: Valid` and a `SignerCertificate` subject matching your `publisherName`.

Or, with the Windows SDK's signtool:

```powershell
signtool verify /pa /v ".\release\Pix8 1.6.5.exe"
```

Confirm a timestamp is present. Also check the inner binary — the portable exe is a
self-extractor that unpacks and runs `Pix8.exe`, and both should be signed.

## What actually gets signed

- `Pix8.exe` (the Electron app binary) inside the package
- Bundled DLLs
- The portable `.exe` self-extractor
- The NSIS installer **and** its generated uninstaller

Each signature counts against your monthly quota, so one `dist:win` run consumes well
more than one signature. This matters much less than it sounds — see cost below.

## Gotchas

**Certificates are valid for ~3 days.** This is by design, and it is why timestamping is
non-negotiable. The timestamp proves the signature was made while the cert was valid, so
already-shipped builds stay valid indefinitely. Don't disable `timestampRfc3161`.

**SmartScreen reputation is still earned, not bought.** Artifact Signing issues OV-class
certificates. The "Unknown publisher" dialog goes away, but SmartScreen reputation
accrues per publisher identity over download volume and time. Early downloaders may still
see a warning. This is not a misconfiguration and there is nothing to fix — it settles as
the reputation builds. Reputation follows the identity, so it carries across Pix8
versions rather than resetting each release.

**`publisherName` mismatch** produces a build that signs fine and then fails verification,
or breaks auto-update signature checks (`verifyUpdateCodeSignature` defaults to `true`).
Copy the CN from the certificate subject preview; don't type it from memory.

**Region mismatch** between the endpoint and the account is a common early error.

**Expired client secret** is the most likely future breakage. Calendar reminder.

## Cost

Basic SKU is **$9.99/month**, including 5,000 signatures and one certificate profile of
each type; additional signatures are $0.005 each. Premium is $99.99/month for 100,000
signatures and ten profiles of each type. For a two-person shop shipping a desktop app,
Basic is far more headroom than you'll use — even at a few hundred signatures per release
you'd need a release a day to approach the cap. You can change SKU later without
recreating resources.

## Optional: CI signing

If you move releases to GitHub Actions, prefer **workload identity federation** (OIDC)
over a stored client secret — it removes the long-lived credential and the expiry
problem entirely. Add a federated credential to the app registration scoped to this
repository, then in the workflow set `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` as before
and let the OIDC token supply the rest. The job must run on a `windows-latest` runner.

Note that electron-builder 26.8.1's explicit env-var check requires one of the three
credential sets above to be present, so verify federation actually satisfies it on your
version before relying on it for a release. Falling back to a repository secret holding
`AZURE_CLIENT_SECRET` works and is a perfectly reasonable starting point.

## Sources

- [Quickstart: Set up Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) — account creation, identity validation, certificate profiles, region endpoints
- [Tutorial: Assign roles in Artifact Signing](https://learn.microsoft.com/en-us/azure/artifact-signing/tutorial-assign-roles) — RBAC role matrix and scoping
- [Artifact Signing resources and roles](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-resources-roles)
- [Artifact Signing pricing](https://azure.microsoft.com/en-us/pricing/details/artifact-signing/)
- [electron-builder: Code Signing for Windows](https://www.electron.build/docs/features/code-signing/code-signing-win/) — note this documents a newer config shape than 26.8.1
- `node_modules/app-builder-lib/out/codeSign/windowsSignAzureManager.js` and
  `out/options/winOptions.d.ts` — authoritative for the installed version's behaviour
