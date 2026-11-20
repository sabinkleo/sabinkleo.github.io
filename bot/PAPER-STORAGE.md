# Paper storage and recovery

The hourly job reads and writes only the runtime ref, `duelo-runtime`. Three working CSVs are reconstructed from the immutable seed and UTC-day journals in the job workspace. The engine keeps its full historical inputs, balances, strategy, curve and trades. Each normal publication advances the runtime ref atomically. Rebuildable workspace files expire when the job ends. npm cache follows the repository's cache policy and is unrelated to wallet recovery. Preserve historical backtest CSVs and their manifest in `bot/history/`.

## Checkpoint and rollback

Fetch the current runtime branch into a clean working tree with current code and install locked dependencies. Check out the runtime branch into a separate directory. From the code checkout run `node bot/paper-runtime.mjs restore /absolute/runtime-directory`. The manifest must match the paper end time, strategy, contract and SHA-256 of the state, CSV and public snapshot. If recovering in production, stop the writer first and restore the selected checkpoint as one forward commit. Resume from that opening using the current configuration after verifying balances and every previous trade. The seed checkpoint embeds the exact originating main commit. Keep the first migration checkpoint ref and evidence.

## Growth and compaction

Once per week record `git count-objects -v`, `git rev-list --count refs/heads/duelo-runtime` and `git rev-list --disk-usage --objects refs/heads/duelo-runtime` from a full clone. Record runtime reachability and whole-repository packed size separately. Review compaction at 2,160 runtime commits or 64 MiB of reachable runtime objects, whichever comes first. Hourly state/public snapshots still duplicate growing curves and Git retains commits. The runtime ref has no automatic history bound. A latest checkpoint still grows with the complete simulation record and required market inputs.

1. In a full clone fetch the exact runtime ref into `refs/heads/duelo-runtime`. Run `bash bot/prepare-paper-compaction.sh refs/heads/duelo-runtime /path/to/empty-output`.
2. Retain the verified history bundle and hash manifest in two durable locations. The script tests restoring the old tip and the one-commit candidate into separate repositories, then verifies the candidate's tree equals the original tree. Also run the checkpoint restore above against the candidate checkout.
3. **Owner approval required for the following production operation.** Pause the writer and verify the branch still equals `source.txt`. Import `candidate.bundle` into a local candidate ref. Publish that exact candidate with an explicit force-with-lease for `refs/heads/duelo-runtime` against the recorded source SHA. Never use an unconditional force push. Compare the public JSON, CSV and contract against the baseline. Resume the writer only once dashboard checks pass.
4. If rollback is required while paused, fetch the recovered tip from `history.bundle`, verify `SHA256SUMS` and use an explicit lease against the candidate SHA to restore the prior tip, subject to owner approval. If any earlier post-compaction openings have already published, recover them from the current branch before evaluating rollback. Never overwrite a newer wallet with a stale checkpoint.

GitHub controls packed-object reclamation. Moving the ref alone cannot guarantee server-side reclamation on a date. Routine Git history stays enabled until the owner approves compaction or a durable object store is provisioned.
