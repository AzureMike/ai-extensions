# Model Run Lifecycle

Use this reference for staging, failed runs, repair budgets, origin records, existing-model repairs, and stale-model refreshes.

## Staged runs

Start every generation or repair with:

```text
node "<loaded-skill-base>/scripts/promote-app-model.mjs" --begin
```

The command removes an interrupted staging directory, records fingerprints of replaceable `.radius/` files, and prints a new staging directory. Write every generated artifact there: `app.bicep`, `bicepconfig.json`, `app.origin.json`, and any generated custom-type artifacts.

Finish with:

```text
node "<loaded-skill-base>/scripts/promote-app-model.mjs" --staging "<staging-dir>"
```

Promotion requires complete artifacts, a matching origin record, and an unchanged destination. On success it publishes files, removes staging, adds `.staging-*/` to `.radius/.gitignore`, and stages the published files.

- Exit `0`: published and staged.
- Exit `1`: refused, discarded, and nothing published.
- Exit `2`: published, but `git add` failed. Report that state and do not rerun.

Never copy generated artifacts into `.radius/`, delete staging manually, or run `git add`. If the destination changed during the run, the user's version remains intact. Do not merge or overwrite it.

## Failed runs

Abort an unpublished run with:

```text
node "<loaded-skill-base>/scripts/promote-app-model.mjs" --abort --staging "<staging-dir>"
```

Report the exact failure and that nothing was written. A transient schema or registry failure may be retried in a new run. A permanent source, Dockerfile, type, Recipe, or runtime-contract blocker should be reported without repeating the same run.

For checker exit `2`, follow the [checker exit-code contract](../SKILL.md#radius-cli-execution-boundary). Never continue or manually restart that staged run. A fresh modeling run starts only when the user requests it after the underlying failure is corrected.

If a Canvas handoff supplied `radius_report_modeling_failure` arguments, call it once only for a permanent unpublished failure. Do not call it for transient failures, cancellation, declined action, or a run that published `app.bicep`.

## Compile repair budget

`validate-bicep.mjs` enforces the budget by counting reserved validation attempts in that run's `run.json`. The first compile is followed by at most five repair-and-recompile cycles. It reserves each attempt before invoking Bicep. An unavailable check still consumes its reserved attempt. An interrupted check also counts.

Only exit `1` permits repair. The checker fingerprints normalized exit `1` diagnostics and reports repeated model failures. Exit `2` retains the last model-failure fingerprint without repeat guidance; exit `0` clears it. A repeated model failure means the previous change was ineffective. Make a materially different fix or use the remaining budget to prove the schema cannot express the runtime requirement.

A completed final attempt with model diagnostics still returns exit `1`; the next invocation is refused with exit `2`. Broken bookkeeping also returns exit `2`. When validation is unavailable or refused, abort and stop under the checker contract. Do not retry validation, edit the model based on that result, write an origin record, or publish. Report the exact failure and that no application model was written. Never remove required runtime behavior to save a repair attempt.

## Origin record

Only after checker exit `0` with no warnings, write:

```text
node "<loaded-skill-base>/scripts/write-app-origin.mjs" "<staging-dir>/app.bicep" --skill-version "<loaded-skill-version>"
```

Omit `--skill-version` when no real version was supplied. Never pass a placeholder. The script records the exact validated bytes and source revision. Never write it after checker exit `1` or `2`. Never write or edit `app.origin.json` manually, and never change `app.bicep` after recording without validating and recording again.

The promote script publishes and stages the model and origin record together. A missing or mismatched record blocks promotion.

## Repairing an existing model

For a deployment failure caused by application-model syntax, schema, references, credentials, configuration, listeners, or dependency wiring:

1. Start a staged run.
2. Copy the current `app.bicep` and `bicepconfig.json` into staging.
3. Confirm the failure belongs to the application model, not provider infrastructure, Recipe execution, Environment setup, or the cluster.
4. Re-resolve affected types and inspect the exact source and runtime contract.
5. Repair the staged model without deleting required behavior. Correct tightly related schema violations found in the same resource and report them.
6. Recheck the whole model and validate under the checker exit-code contract. Only exit `1` permits another repair; exit `2` requires aborting and reporting the exact failure. Only after exit `0`, write a new origin record and promote.

If the same deployment error recurs, do not reapply the same fix. Try a materially different supported repair. After distinct fixes fail or no supported fix exists, report the blocker for deployment diagnostics.

## Refreshing a stale model

- If the Canvas reports manual edits, ask before overwriting. Offer an in-place repair as the alternative.
- If the model has no origin record, regenerate without asking. A missing record alone does not prove manual edits.
- If only source or generator identity changed, refresh without asking.
- Refresh only the current workspace branch. Do not commit, push, or regenerate another branch.
- Do not search for manual edits when the Canvas did not report them.
